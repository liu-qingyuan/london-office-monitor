import {GeoJsonLayer, TextLayer} from '@deck.gl/layers';
import {MapLibreOverlay} from '@deck.gl/maplibre';
import {Map, setWorkerUrl} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type {Area, AreaFeature, AreaId, Geometry, Market, Observation} from './types';

setWorkerUrl(workerUrl);

const localStyle = {version: 8 as const, sources: {}, layers: [{id: 'local-background', type: 'background' as const, paint: {'background-color': '#e6eae6'}}]};
const remoteStyle = 'https://tiles.openfreemap.org/styles/positron';
type BasemapStatus = 'loading' | 'available' | 'unavailable';

export class MarketMap {
  private map: Map | null = null;
  private overlay: MapLibreOverlay | null = null;
  private geometry: Geometry | null = null;
  private market: Market | null = null;
  private areas: Area[] = [];
  private selected: AreaId = 'city';
  private unavailable = false;
  private basemapStatus: BasemapStatus = 'loading';
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly onSelect: (area: AreaId) => void,
    private readonly onHover: (area: AreaId | null, x: number, y: number) => void,
    private readonly onStatus: (message: string) => void
  ) {}

  start(): void {
    try {
      const probe = document.createElement('canvas');
      if (!probe.getContext('webgl2')) {
        this.onStatus('WebGL2 unavailable · map cannot render. The market list remains available.');
        return;
      }
      // Load the final style before attaching deck. Swapping an already pickable
      // local style for the remote style could invalidate the first pointer pick.
      this.map = new Map({container: this.container, style: remoteStyle, center: [-0.095, 51.515], zoom: 11.2, canvasContextAttributes: {antialias: true}});
      this.map.on('error', () => this.basemapFailed());
      this.timer = setTimeout(() => this.basemapFailed(), 12000);
      this.map.once('load', () => {
        if (!this.map) return;
        this.overlay = new MapLibreOverlay({interleaved: true, layers: []});
        this.map.addControl(this.overlay);
        this.draw();
      });
      this.map.once('idle', () => {
        if (!this.unavailable) {
          this.basemapStatus = 'available';
          if (this.timer) clearTimeout(this.timer);
          this.onStatus('OpenFreeMap background · illustrative selectors');
        }
      });
      this.onStatus('Loading OpenFreeMap background · illustrative selectors');
    } catch {
      this.onStatus('Map rendering unavailable · market data remains accessible in the list.');
    }
  }

  private basemapFailed(): void {
    if (this.unavailable || !this.map) return;
    this.unavailable = true;
    this.basemapStatus = 'unavailable';
    if (this.timer) clearTimeout(this.timer);
    this.map.setStyle(localStyle);
    this.onStatus('Background service unavailable · selection geometry remains available');
  }

  update(geometry: Geometry | null, market: Market | null, areas: Area[], selected: AreaId): void {
    if (geometry) this.geometry = geometry;
    this.market = market;
    this.areas = areas;
    this.selected = selected;
    this.draw();
  }

  private draw(): void {
    if (!this.overlay || !this.geometry) return;
    const observations = new globalThis.Map(this.market?.observations.map(o => [o.area_id, o]) ?? []);
    const status = (feature: {properties: AreaFeature['properties']}): Observation | undefined => observations.get(feature.properties.area_id);
    const color = (feature: {properties: AreaFeature['properties']}): [number, number, number, number] => {
      const observation = status(feature);
      if (!observation || observation.status !== 'available' || observation.value === null) return [153, 162, 167, 110];
      return feature.properties.area_id === this.selected ? [24, 90, 100, 185] : [64, 137, 140, 135];
    };
    this.overlay.setProps({layers: [
      new GeoJsonLayer<AreaFeature['properties']>({
        id: 'illustrative-area-selectors', data: this.geometry, pickable: true, filled: true, stroked: true,
        getFillColor: color, getLineColor: f => f.properties.area_id === this.selected ? [10, 53, 65, 255] : [48, 93, 99, 225],
        getLineWidth: f => f.properties.area_id === this.selected ? 3 : 1.6, lineWidthUnits: 'pixels', lineAntialiasing: true,
        onHover: info => {
          const feature = info.object;
          this.onHover(feature?.properties.area_id ?? null, info.x, info.y);
          this.container.style.cursor = feature ? 'pointer' : '';
        },
        onClick: info => { if (info.object) this.onSelect(info.object.properties.area_id); }
      }),
      new TextLayer<Area>({
        id: 'illustrative-area-labels', data: this.areas, pickable: false,
        getPosition: area => area.center, getText: area => area.name,
        getColor: [24, 48, 56, 255], getSize: 14, sizeUnits: 'pixels',
        fontFamily: 'Arial, sans-serif', fontWeight: 700,
        getTextAnchor: 'middle', getAlignmentBaseline: 'center',
        background: true, getBackgroundColor: [250, 250, 247, 225], backgroundPadding: [7, 4]
      })
    ]});
  }

  debug(): {webgl2: boolean; interleaved: boolean; deckCanvasShared: boolean; baseMapStatus: BasemapStatus; geometryCount: number} {
    const canvas = this.map?.getCanvas();
    return {
      webgl2: Boolean(canvas?.getContext('webgl2')),
      interleaved: Boolean(this.overlay),
      deckCanvasShared: Boolean(canvas && this.overlay?.getCanvas() === canvas),
      baseMapStatus: this.basemapStatus,
      geometryCount: this.geometry?.features.length ?? 0
    };
  }

  project(lngLat: [number, number]): {x: number; y: number} | null {
    if (!this.map) return null;
    const point = this.map.project(lngLat);
    return {x: point.x, y: point.y};
  }
}

declare global {
  interface Window {
    /** Read-only projection/render diagnostic for browser tests; does not select an area. */
    __officeMapDebug?: {state: () => ReturnType<MarketMap['debug']>; project: (point: [number, number]) => {x: number; y: number} | null};
  }
}
