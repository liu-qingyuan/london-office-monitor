"""Offline contracts for the macOS official watcher schedule (synthetic fixtures only)."""
from __future__ import annotations

import importlib.util
import io
import json
import os
import plistlib
import subprocess
import sys
import threading
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from london_office.monitor_schedule import Schedule, ScheduleError, main

ROOT = Path(__file__).resolve().parent.parent


@unittest.skipUnless(os.name == "posix" and importlib.util.find_spec("fcntl") is not None,
                     "Native simulator requires POSIX flock; unsupported OS is tested separately")
class ScheduleTests(unittest.TestCase):
    def setUp(self):
        (ROOT / "var").mkdir(exist_ok=True)
        platform_patch = patch("london_office.monitor_schedule.sys.platform", "darwin")
        platform_patch.start()
        self.addCleanup(platform_patch.stop)
        self.temporary = TemporaryDirectory(prefix="schedule-fixture-", dir=ROOT / "var")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.plan = self.root / "plan.json"
        self.plan.write_text(json.dumps({"schema_version": 1, "watch_ids": ["savills-central-london", "crown-estate-news"]}), encoding="utf-8")
        self.budget = self.root / "synthetic-budget.json"
        self.budget.write_text('{"synthetic_fixture_only": true}\n', encoding="utf-8")
        self.run_dir = self.root / "schedule"
        self.config = self.root / "schedule.json"
        self.settings = {"schema_version": 1, "interval_seconds": 60, "max_runs": 2,
                         "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
                         "plan": str(self.plan), "budget_file": str(self.budget), "run_dir": str(self.run_dir)}
        self.config.write_text(json.dumps(self.settings), encoding="utf-8")

    def _native(self):
        state = {"loaded": False, "calls": []}

        def launchctl(args, **kwargs):
            state["calls"].append(args)
            if args[1] == "print":
                if state["loaded"]:
                    return subprocess.CompletedProcess(args, 0, "native launchd state: loaded", "")
                return subprocess.CompletedProcess(args, 113, "", "Could not find service")
            if args[1] == "bootstrap":
                state["loaded"] = True
            elif args[1] == "bootout":
                state["loaded"] = False
            else:
                self.fail(f"Unexpected launchctl action: {args}")
            return subprocess.CompletedProcess(args, 0, "", "")

        return state, launchctl

    def test_install_writes_bounded_native_interval_job_only_in_repository_runtime(self):
        calls = []
        loaded = False

        def launchctl(args, **kwargs):
            nonlocal loaded
            calls.append(args)
            if args[1] == "print":
                return subprocess.CompletedProcess(args, 0 if loaded else 113, "native state" if loaded else "",
                                                   "" if loaded else "Could not find service")
            loaded = True
            return subprocess.CompletedProcess(args, 0, "", "")

        with patch("london_office.monitor_schedule.subprocess.run", side_effect=launchctl):
            installed = Schedule.install(self.config)
        plist = self.run_dir / (installed["label"] + ".plist")
        job = plistlib.loads(plist.read_bytes())
        self.assertEqual(job["StartInterval"], 60)
        self.assertFalse(job["RunAtLoad"])
        self.assertFalse(job["KeepAlive"])
        self.assertEqual(job["ProgramArguments"], [str(ROOT / ".venv/bin/python"), "-m", "london_office.monitor_schedule",
                                                  "--config", str(self.config), "--tick"])
        self.assertEqual(job["WorkingDirectory"], str(ROOT))
        self.assertEqual(job["StandardOutPath"], str(self.run_dir / "stdout.log"))
        self.assertEqual(job["StandardErrorPath"], str(self.run_dir / "stderr.log"))
        self.assertEqual(calls[-2], ["/bin/launchctl", "bootstrap", f"gui/{os.getuid()}", str(plist)])
        self.assertEqual(calls[-1], ["/bin/launchctl", "print", installed["native_target"]])
        self.assertEqual(installed["native_target"], f"gui/{os.getuid()}/{installed['label']}")
        self.assertNotIn("synthetic_fixture_only", plist.read_text(encoding="utf-8"))

    def test_real_native_print_idempotent_install_and_only_own_label_bootout(self):
        state, launchctl = self._native()
        with patch("london_office.monitor_schedule.subprocess.run", side_effect=launchctl):
            first = Schedule.install(self.config)
            ownership = (self.run_dir / "installation.json").read_bytes()
            again = Schedule.install(self.config)
            visible = Schedule.status(self.config)
            removed = Schedule.remove(self.config)
            repeated = Schedule.remove(self.config)
        self.assertEqual(first["status"], "installed")
        self.assertEqual(again["status"], "already_installed")
        self.assertEqual(visible["status"], "installed")
        self.assertTrue(visible["native_loaded"])
        self.assertEqual(visible["native_print"], "native launchd state: loaded")
        self.assertEqual(visible["run_starts"], 0)
        self.assertEqual(removed["status"], "removed")
        self.assertEqual(repeated["status"], "not_installed")
        self.assertEqual([call[1] for call in state["calls"]].count("bootstrap"), 1)
        self.assertEqual([call for call in state["calls"] if call[1] == "bootout"],
                         [["/bin/launchctl", "bootout", first["native_target"]]])
        self.assertEqual((self.run_dir / "installation.json").read_bytes(), ownership)
        self.assertFalse((self.run_dir / (first["label"] + ".plist")).exists())

    def test_two_ticks_record_source_ids_success_failure_then_never_request_again(self):
        state, launchctl = self._native()
        source_results = [
            {"id": "watch-fixture-first", "status": "baseline_captured"},
            {"id": "watch-fixture-second", "status": "check_failed", "sources": [
                {"watch_id": "savills-central-london", "error": {"code": "parse_unconfirmed", "message": "No bound links."}}]},
        ]
        with patch("london_office.monitor_schedule.subprocess.run", side_effect=launchctl), \
                patch("london_office.monitor_schedule._run_watch", side_effect=source_results) as watcher:
            Schedule.install(self.config)
            first = Schedule.tick(self.config)
            first_started = (self.run_dir / "runs" / first["id"] / "started.json").read_bytes()
            first_completed = (self.run_dir / "runs" / first["id"] / "completed.json").read_bytes()
            second = Schedule.tick(self.config)
            third = Schedule.tick(self.config)
            visible = Schedule.status(self.config)
        self.assertEqual([first["status"], second["status"], third["status"]], ["completed", "failed", "skipped"])
        self.assertEqual(third["reason"], "exhausted")
        self.assertEqual((first["source_run_id"], second["source_run_id"]), ("watch-fixture-first", "watch-fixture-second"))
        self.assertEqual(second["error"]["sources"][0]["error"]["code"], "parse_unconfirmed")
        self.assertEqual(visible["run_starts"], 2)
        self.assertEqual(visible["remaining_runs"], 0)
        self.assertEqual([record["source_run_id"] for record in visible["runs"]],
                         ["watch-fixture-first", "watch-fixture-second"])
        self.assertEqual(watcher.call_count, 2)
        self.assertEqual((self.run_dir / "runs" / first["id"] / "started.json").read_bytes(), first_started)
        self.assertEqual((self.run_dir / "runs" / first["id"] / "completed.json").read_bytes(), first_completed)
        self.assertEqual(json.loads(self.budget.read_text(encoding="utf-8")), {"synthetic_fixture_only": True})
        self.assertTrue(state["loaded"])

    def test_expired_tick_does_not_start_official_watch(self):
        state, launchctl = self._native()
        with patch("london_office.monitor_schedule.subprocess.run", side_effect=launchctl):
            Schedule.install(self.config)
        expiry = datetime.fromisoformat(self.settings["expires_at"])
        with patch("london_office.monitor_schedule._now", return_value=expiry), \
                patch("london_office.monitor_schedule._run_watch") as watcher:
            skipped = Schedule.tick(self.config)
        self.assertEqual(skipped["reason"], "expired")
        self.assertEqual(skipped["run_starts"], 0)
        watcher.assert_not_called()
        self.assertFalse((self.run_dir / "runs").exists())
        self.assertTrue(state["loaded"])

    def test_expiry_and_failed_or_incomplete_starts_never_refund(self):
        state, launchctl = self._native()
        self.settings["max_runs"] = 1
        self.config.write_text(json.dumps(self.settings), encoding="utf-8")
        with patch("london_office.monitor_schedule.subprocess.run", side_effect=launchctl):
            Schedule.install(self.config)
        with patch("london_office.monitor_schedule._run_watch", side_effect=ScheduleError("fixture_failure", "Safe fixture failure")) as watcher:
            failed = Schedule.tick(self.config)
            blocked = Schedule.tick(self.config)
        self.assertEqual(failed["error"], {"code": "fixture_failure", "message": "Safe fixture failure"})
        self.assertEqual(blocked["reason"], "exhausted")
        watcher.assert_called_once()
        self.assertEqual(len(list((self.run_dir / "runs").glob("*/started.json"))), 1)

        # A second fixture demonstrates that an interrupted completion also consumes a start.
        with TemporaryDirectory(prefix="schedule-fixture-", dir=ROOT / "var") as other:
            other_dir = Path(other)
            other_config = other_dir / "schedule.json"
            other_plan = other_dir / "plan.json"
            other_budget = other_dir / "budget.json"
            other_plan.write_text(self.plan.read_text(encoding="utf-8"), encoding="utf-8")
            other_budget.write_text(self.budget.read_text(encoding="utf-8"), encoding="utf-8")
            other_config.write_text(json.dumps({**self.settings, "plan": str(other_plan), "budget_file": str(other_budget),
                                                "run_dir": str(other_dir / "schedule")}), encoding="utf-8")
            fresh, native = self._native()
            with patch("london_office.monitor_schedule.subprocess.run", side_effect=native):
                Schedule.install(other_config)
            from london_office.monitor_schedule import _publish
            def cannot_complete(path, record):
                if path.name == "completed.json":
                    raise OSError("synthetic interrupted completion")
                return _publish(path, record)
            with patch("london_office.monitor_schedule._publish", side_effect=cannot_complete), \
                    patch("london_office.monitor_schedule._run_watch", return_value={"id": "watch-fixture-incomplete", "status": "baseline_captured"}):
                with self.assertRaises(OSError):
                    Schedule.tick(other_config)
            with patch("london_office.monitor_schedule._run_watch") as never_called:
                self.assertEqual(Schedule.tick(other_config)["reason"], "exhausted")
                never_called.assert_not_called()
            with patch("london_office.monitor_schedule.subprocess.run", side_effect=native):
                runs = Schedule.status(other_config)["runs"]
            self.assertEqual(runs[0]["status"], "incomplete")
            self.assertEqual(len(runs), 1)
            self.assertTrue(fresh["loaded"])

        expired_config = self.root / "expired.json"
        expired_config.write_text(json.dumps({**self.settings, "run_dir": str(self.root / "expired-run"),
                                              "expires_at": (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()}), encoding="utf-8")
        with patch("london_office.monitor_schedule.subprocess.run") as native, \
                patch("london_office.monitor_schedule._run_watch") as watcher:
            with self.assertRaises(ScheduleError) as error:
                Schedule.install(expired_config)
        self.assertEqual(error.exception.code, "schedule_expired")
        native.assert_not_called()
        watcher.assert_not_called()

    def test_cli_json_status_and_errors_require_genuine_native_print(self):
        state, launchctl = self._native()
        with patch("london_office.monitor_schedule.subprocess.run", side_effect=launchctl):
            with redirect_stdout(io.StringIO()) as installed_stdout:
                self.assertEqual(main(["--config", str(self.config), "--install"]), 0)
            installed = json.loads(installed_stdout.getvalue())
            with redirect_stdout(io.StringIO()) as status_stdout:
                self.assertEqual(main(["--config", str(self.config), "--status"]), 0)
            status = json.loads(status_stdout.getvalue())
        self.assertEqual(installed["native_target"], status["native_target"])
        self.assertTrue(status["native_loaded"])
        self.assertEqual(status["native_print"], "native launchd state: loaded")
        self.assertEqual(status["runs"], [])
        self.assertTrue(state["loaded"])
        with patch("london_office.monitor_schedule.sys.platform", "linux"), redirect_stdout(io.StringIO()) as invalid:
            self.assertEqual(main(["--config", str(self.config), "--status"]), 1)
        self.assertEqual(json.loads(invalid.getvalue())["error"]["code"], "unsupported_os")

    def test_config_plan_and_runtime_path_rejected_before_native_or_watch(self):
        cases = [
            ({"interval_seconds": 29}, "invalid_schedule_config"),
            ({"max_runs": True}, "invalid_schedule_config"),
            ({"expires_at": "2026-10-12T09:00:00"}, "invalid_schedule_config"),
            ({"command": "/bin/sh"}, "invalid_schedule_config"),
            ({"run_dir": str(ROOT)}, "invalid_schedule_path"),
            ({"budget_file": str(self.root / "missing.json")}, "invalid_schedule_config"),
        ]
        for changes, expected in cases:
            with self.subTest(changes=changes):
                self.config.write_text(json.dumps({**self.settings, **changes}), encoding="utf-8")
                with patch("london_office.monitor_schedule.subprocess.run") as native, \
                        patch("london_office.monitor_schedule._run_watch") as watcher:
                    with self.assertRaises(ScheduleError) as caught:
                        Schedule.install(self.config)
                self.assertEqual(caught.exception.code, expected)
                native.assert_not_called()
                watcher.assert_not_called()
        self.config.write_text(json.dumps(self.settings), encoding="utf-8")
        self.plan.write_text(json.dumps({"schema_version": 1, "watch_ids": ["user-url"]}), encoding="utf-8")
        with patch("london_office.monitor_schedule.subprocess.run") as native:
            with self.assertRaises(ScheduleError) as caught:
                Schedule.install(self.config)
        self.assertEqual(caught.exception.code, "invalid_schedule_plan")
        native.assert_not_called()
        self.assertFalse(self.run_dir.exists())
        self.plan.write_text(json.dumps({"schema_version": 1, "watch_ids": ["savills-central-london"]}), encoding="utf-8")
        link = self.root / "symlink-plan.json"
        link.symlink_to(self.plan)
        self.config.write_text(json.dumps({**self.settings, "plan": str(link)}), encoding="utf-8")
        with patch("london_office.monitor_schedule.subprocess.run") as native:
            with self.assertRaises(ScheduleError) as linked:
                Schedule.install(self.config)
        self.assertEqual(linked.exception.code, "invalid_schedule_path")
        native.assert_not_called()

    def test_missing_plan_and_receipt_still_allow_safe_native_removal(self):
        state, launchctl = self._native()
        with patch("london_office.monitor_schedule.subprocess.run", side_effect=launchctl):
            installed = Schedule.install(self.config)
            self.plan.unlink()
            self.budget.unlink()
            visible = Schedule.status(self.config)
            removed = Schedule.remove(self.config)
        self.assertTrue(visible["native_loaded"])
        self.assertEqual(removed["status"], "removed")
        self.assertEqual([call for call in state["calls"] if call[1] == "bootout"],
                         [["/bin/launchctl", "bootout", installed["native_target"]]])
        self.assertFalse(state["loaded"])

    def test_nondedicated_run_dir_is_rejected_before_any_native_action_or_lock(self):
        self.run_dir.mkdir()
        (self.run_dir / "unrelated.txt").write_text("synthetic unrelated file", encoding="utf-8")
        with patch("london_office.monitor_schedule.subprocess.run") as native:
            with self.assertRaises(ScheduleError) as blocked:
                Schedule.install(self.config)
        self.assertEqual(blocked.exception.code, "invalid_schedule_path")
        native.assert_not_called()
        self.assertFalse((self.run_dir / "schedule.lock").exists())

    def test_changed_plan_cannot_switch_watch_targets_after_install(self):
        state, launchctl = self._native()
        with patch("london_office.monitor_schedule.subprocess.run", side_effect=launchctl):
            Schedule.install(self.config)
        self.plan.write_text(json.dumps({"schema_version": 1, "watch_ids": ["savills-central-london"]}), encoding="utf-8")
        with patch("london_office.monitor_schedule._run_watch") as watcher:
            with self.assertRaises(ScheduleError) as blocked:
                Schedule.tick(self.config)
        self.assertEqual(blocked.exception.code, "schedule_config_changed")
        watcher.assert_not_called()
        self.assertTrue(state["loaded"])
        self.assertFalse((self.run_dir / "runs").exists())

    def test_changed_config_and_unowned_native_label_cannot_bootout_or_extend_cap(self):
        state, launchctl = self._native()
        with patch("london_office.monitor_schedule.subprocess.run", side_effect=launchctl):
            Schedule.install(self.config)
            self.settings["max_runs"] = 10
            self.config.write_text(json.dumps(self.settings), encoding="utf-8")
            with self.assertRaises(ScheduleError) as blocked:
                Schedule.remove(self.config)
            with self.assertRaises(ScheduleError) as blocked_tick:
                Schedule.tick(self.config)
        self.assertEqual(blocked.exception.code, "schedule_config_changed")
        self.assertEqual(blocked_tick.exception.code, "schedule_config_changed")
        self.assertFalse(any(call[1] == "bootout" for call in state["calls"]))
        self.assertTrue(state["loaded"])

        self.settings["max_runs"] = 2
        self.config.write_text(json.dumps(self.settings), encoding="utf-8")
        (self.run_dir / "installation.json").unlink()
        with patch("london_office.monitor_schedule.subprocess.run", side_effect=launchctl):
            with self.assertRaises(ScheduleError) as unowned:
                Schedule.remove(self.config)
        self.assertEqual(unowned.exception.code, "unowned_schedule")
        self.assertFalse(any(call[1] == "bootout" for call in state["calls"]))

    @unittest.skipUnless(importlib.util.find_spec("fcntl") is not None, "POSIX file lock unavailable")
    def test_overlapping_cli_process_cannot_start_second_official_request(self):
        state, launchctl = self._native()
        with patch("london_office.monitor_schedule.subprocess.run", side_effect=launchctl):
            Schedule.install(self.config)
        entered = threading.Event()
        release = threading.Event()
        output = []

        def watcher(config):
            entered.set()
            if not release.wait(timeout=10):
                raise AssertionError("synthetic watcher was not released")
            return {"id": "watch-fixture-held", "status": "baseline_captured"}

        def run_first():
            output.append(Schedule.tick(self.config))

        with patch("london_office.monitor_schedule._run_watch", side_effect=watcher) as first_watch:
            thread = threading.Thread(target=run_first)
            thread.start()
            try:
                self.assertTrue(entered.wait(timeout=5))
                # Separate Python process invokes the public CLI; its launchd/HTTP paths
                # cannot be reached while the first tick holds the flock.
                script = ("import json, sys; import london_office.monitor_schedule as m; "
                          "m.sys.platform = 'darwin'; sys.exit(m.main(['--config', sys.argv[1], '--tick']))")
                child = subprocess.run([sys.executable, "-c", script, str(self.config)], cwd=ROOT,
                                       capture_output=True, text=True, timeout=10)
                self.assertEqual(child.returncode, 0, child.stderr)
                self.assertEqual(json.loads(child.stdout)["reason"], "overlap")
            finally:
                release.set()
                thread.join(timeout=10)
            self.assertFalse(thread.is_alive())
            first_watch.assert_called_once()
        self.assertEqual(output[0]["source_run_id"], "watch-fixture-held")
        self.assertEqual(len(list((self.run_dir / "runs").glob("*/started.json"))), 1)


class UnsupportedPlatformTests(unittest.TestCase):
    def test_unsupported_os_has_explicit_error_before_config_or_native_calls(self):
        with patch("london_office.monitor_schedule.sys.platform", "win32"), \
                patch("london_office.monitor_schedule.subprocess.run") as native, \
                patch("london_office.monitor_schedule._run_watch") as watcher:
            with self.assertRaises(ScheduleError) as error:
                Schedule.install(Path("nonexistent.json"))
            with self.assertRaises(ScheduleError):
                Schedule.tick(Path("nonexistent.json"))
        self.assertEqual(error.exception.code, "unsupported_os")
        native.assert_not_called()
        watcher.assert_not_called()


if __name__ == "__main__":
    unittest.main()
