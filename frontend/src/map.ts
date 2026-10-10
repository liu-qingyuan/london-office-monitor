import {GeoJsonLayer, TextLayer} from '@deck.gl/layers';
import {MapLibreOverlay} from '@deck.gl/maplibre';
import {AttributionControl, Map, ScaleControl, setWorkerUrl, type GeoJSONSource} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type {Area, AreaFeature, AreaId, Geometry, Market, Observation} from './types';

setWorkerUrl(workerUrl);

const overview = {center: [-0.095, 51.513] as [number, number], zoom: 14.05, pitch: 55, bearing: -22};
const localStyle = {version: 8 as const, sources: {}, layers: [{id: 'local-background', type: 'background' as const, paint: {'background-color': '#142632'}}]};
const remoteStyle = 'https://tiles.openfreemap.org/styles/dark';
const buildingLayer = 'office-buildings-3d';
const buildingSource = 'map-provided-building-parts';
type PolygonRings = number[][][];

// Spatial selection for display only. Source MultiPolygons can aggregate many
// unrelated buildings at the same height, so tint individual polygon parts.
function pointInPolygon(point: number[], rings: PolygonRings): boolean {
  const inside = (ring: number[][]): boolean => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!, b = ring[j]!;
      if ((a[1]! > point[1]!) !== (b[1]! > point[1]!) && point[0]! < (b[0]! - a[0]!) * (point[1]! - a[1]!) / (b[1]! - a[1]!) + a[0]!) hit = !hit;
    }
    return hit;
  };
  return Boolean(rings[0] && inside(rings[0]) && !rings.slice(1).some(inside));
}
function polygonsIntersect(a: PolygonRings, b: PolygonRings): boolean {
  if (!a[0]?.length || !b[0]?.length) return false;
  if (a[0].some(point => pointInPolygon(point,b)) || b[0].some(point => pointInPolygon(point,a))) return true;
  const cross = (p: number[], q: number[], r: number[]) => (q[0]!-p[0]!)*(r[1]!-p[1]!)-(q[1]!-p[1]!)*(r[0]!-p[0]!);
  for (const ringA of a) for (const ringB of b) {
    for (let i=1;i<ringA.length;i++) for (let j=1;j<ringB.length;j++) {
      const p=ringA[i-1]!, q=ringA[i]!, r=ringB[j-1]!, s=ringB[j]!;
      if (Math.max(p[0]!,q[0]!) < Math.min(r[0]!,s[0]!) || Math.max(r[0]!,s[0]!) < Math.min(p[0]!,q[0]!) || Math.max(p[1]!,q[1]!) < Math.min(r[1]!,s[1]!) || Math.max(r[1]!,s[1]!) < Math.min(p[1]!,q[1]!)) continue;
      if (cross(p,q,r)*cross(p,q,s) <= 0 && cross(r,s,p)*cross(r,s,q) <= 0) return true;
    }
  }
  return false;
}
type BasemapStatus = 'loading' | 'available' | 'unavailable';
export type CameraState = {zoom: number; bearing: number; pitch: number; center: [number, number]};

export class MarketMap {
  private map: Map | null = null;
  private overlay: MapLibreOverlay | null = null;
  private geometry: Geometry | null = null;
  private market: Market | null = null;
  private areas: Area[] = [];
  private selected: AreaId = 'city';
  private basemapStatus: BasemapStatus = 'loading';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private vectorError = false;
  private buildingSelectionSignature = '';
  private selectedBuildings: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  private buildingsDirty = true;
  private buildingSelectionArea: AreaId | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly onSelect: (area: AreaId) => void,
    private readonly onHover: (area: AreaId | null, x: number, y: number) => void,
    private readonly onStatus: (message: string) => void,
    private readonly onCamera?: (state: CameraState) => void
  ) {}

  start(): void {
    try {
      const probe = document.createElement('canvas');
      if (!probe.getContext('webgl2')) {
        this.onStatus('WebGL2 unavailable · map cannot render. The market list remains available.');
        return;
      }
      // Establish the real style and its extrusions BEFORE adding the interleaved
      // deck layer: a later style swap used to lose the first polygon pointer pick.
      this.map = new Map({
        container: this.container, style: remoteStyle, ...overview,
        minZoom: 11, maxZoom: 18, maxPitch: 75,
        dragRotate: true, pitchWithRotate: true,
        canvasContextAttributes: {antialias: true}, attributionControl: false
      });
      // Opening the integrated detail region changes the canvas container, not
      // the window. Keep the real map viewport and projection in sync with it.
      new ResizeObserver(() => { this.map?.resize(); this.onCamera?.(this.camera()); }).observe(this.container);
      this.map.addControl(new ScaleControl({maxWidth:90,unit:'metric'}),'bottom-left');
      this.map.addControl(new AttributionControl({compact:true}),'bottom-right');
      this.map.on('error', event => {
        if (this.basemapStatus === 'unavailable') return;
        // Glyph/sprite/label errors are not failures of the vector background.
        const sourceId = (event as typeof event & {sourceId?: string}).sourceId;
        const detail = event.error?.message ?? '';
        if (sourceId === 'openmaptiles' || detail.includes('/planet')) this.vectorError = true;
        if (!this.map?.isStyleLoaded() && (detail.includes('/styles/dark') || detail.includes(remoteStyle))) this.basemapFailed();
      });
      this.map.on('style.load', () => {
        if (!this.map) return;
        if (this.basemapStatus !== 'unavailable') this.installCityStyle();
        if (!this.overlay) {
          this.overlay = new MapLibreOverlay({interleaved: true, layers: []});
          this.map.addControl(this.overlay);
        }
        // The control itself reinserts its existing layers after setStyle(); never
        // add a second control on the dark-background fallback.
        this.draw();
      });
      this.map.on('sourcedata', event => { if (event.sourceId === 'openmaptiles') this.buildingsDirty = true; });
      this.map.on('idle', () => {
        if (this.updateSelectedBuildings()) this.draw();
        if (!this.map || this.basemapStatus !== 'loading' || !this.map.getLayer(buildingLayer)) return;
        if (this.map.isSourceLoaded('openmaptiles')) {
          if (this.vectorError && !this.renderedBuildingCount()) {
            this.basemapFailed();
            return;
          }
          this.basemapStatus = 'available';
          this.clearTimer();
          this.onStatus('City background ready · OpenFreeMap');
        }
      });
      // MapLibre owns the native gesture; use deck's public GPU picking API at
      // its click coordinates instead of racing two canvas gesture recognizers.
      this.map.on('click', event => {
        if (!this.overlay || !this.geometry) return;
        const hit = this.overlay.pickObject({x:event.point.x,y:event.point.y,radius:2,layerIds:['illustrative-area-selectors']});
        const feature = hit?.object as AreaFeature | undefined;
        if (feature) this.onSelect(feature.properties.area_id);
      });
      this.map.on('move', () => this.onCamera?.(this.camera()));
      this.map.on('moveend', () => { this.buildingsDirty = true; this.onHover(null,0,0); this.draw(); });
      this.timer = setTimeout(() => {
        if (this.basemapStatus === 'loading') this.basemapFailed();
      }, 18000);
      this.onStatus('Loading OpenFreeMap background · illustrative selectors');
    } catch {
      this.onStatus('Map rendering unavailable · market data remains accessible in the list.');
    }
  }

  private installCityStyle(): void {
    const map = this.map;
    if (!map || !map.getSource('openmaptiles') || map.getLayer(buildingLayer)) return;
    const paint = (id: string, property: Parameters<Map['setPaintProperty']>[1], value: string | number) => {
      if (map.getLayer(id)) map.setPaintProperty(id, property, value);
    };
    paint('background', 'background-color', '#142632');
    paint('water', 'fill-color', '#0b1f2d');
    paint('waterway', 'line-color', '#173d4b');
    paint('building', 'fill-color', '#23404c');
    paint('building', 'fill-outline-color', '#46717b');
    paint('landuse_park', 'fill-color', '#1b393c');
    paint('landcover_wood', 'fill-color', '#1b393c');
    if (map.getLayer('landcover_wood')) map.setPaintProperty('landcover_wood', 'fill-pattern', undefined);
    for (const id of ['highway_minor', 'highway_major_inner', 'highway_motorway_inner', 'highway_major_subtle']) {
      paint(id, 'line-color', '#41616e');
    }
    for (const id of ['highway_major_casing', 'highway_motorway_casing']) paint(id, 'line-color', '#243e4b');
    for (const id of ['railway', 'railway_transit']) paint(id, 'line-color', '#385562');
    paint('highway_name_other', 'text-color', '#7e9da5');
    paint('highway_name_other', 'text-opacity', 0.28);
    paint('place_suburb', 'text-opacity', 0.45);
    paint('place_suburb', 'text-color', '#8aaab0');
    paint('place_other', 'text-opacity', 0.3);
    paint('water_name', 'text-color', '#6794a6');
    map.setLight({anchor: 'viewport', position: [1.5, 210, 50], color: '#cee6e9', intensity: 0.6});
    // OpenMapTiles building.render_height / render_min_height are derived from
    // OSM height or levels (not surveyed market or verified building data).
    // z14+ has individual footprints and usable heights; omit absent heights
    // and hide_3d outlines rather than fabricating a skyline.
    map.addSource(buildingSource, {type:'geojson',data:{type:'FeatureCollection',features:[]},tolerance:0,maxzoom:18});
    map.addLayer({
      id: buildingLayer, type: 'fill-extrusion', source: buildingSource, minzoom: 14,
      filter: ['all', ['has', 'render_height'], ['!=', ['get', 'hide_3d'], true]],
      paint: {
        'fill-extrusion-color': ['case',['boolean',['get','current_selection'],false],'#e6ab43','#456d7a'],
        'fill-extrusion-height': ['get', 'render_height'],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 1,
        'fill-extrusion-vertical-gradient': true
      }
    }, map.getLayer('highway_name_other') ? 'highway_name_other' : undefined);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private basemapFailed(): void {
    if (this.basemapStatus === 'unavailable' || !this.map) return;
    this.basemapStatus = 'unavailable';
    this.clearTimer();
    this.map.setStyle(localStyle);
    this.onStatus('Background service unavailable · selection geometry remains available');
  }

  update(geometry: Geometry | null, market: Market | null, areas: Area[], selected: AreaId): void {
    if (geometry) this.geometry = geometry;
    this.market = market;
    this.areas = areas;
    this.selected = selected;
    // Filter/period updates repaint selectors only; the user's camera is untouched.
    this.updateSelectedBuildings();
    this.draw();
  }

  private updateSelectedBuildings(): boolean {
    const selector = this.geometry?.features.find(f => f.properties.area_id === this.selected);
    const source = this.map?.getSource<GeoJSONSource>(buildingSource);
    if (!this.map || !source || !selector || !this.map.getSource('openmaptiles')) return false;
    if (!this.buildingsDirty && this.buildingSelectionArea === this.selected) return false;
    this.buildingsDirty = false;
    this.buildingSelectionArea = this.selected;
    if (this.map.getZoom() < 14) {
      const changed = this.selectedBuildings.length > 0;
      this.selectedBuildings = [];
      this.buildingSelectionSignature = '';
      if (changed) source.setData({type:'FeatureCollection',features:[]});
      return changed;
    }
    const selectors = selector.geometry.type === 'Polygon' ? [selector.geometry.coordinates] : selector.geometry.coordinates;
    const parts = new globalThis.Map<string, GeoJSON.Feature<GeoJSON.Polygon>>();
    const bounds = this.map.getBounds();
    for (const feature of this.map.querySourceFeatures('openmaptiles',{sourceLayer:'building'})) {
      if (typeof feature.properties.render_height !== 'number' || feature.properties.hide_3d === true) continue;
      const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [];
      for (const coordinates of polygons) {
        const outer = coordinates[0]!;
        if (!outer.length) continue;
        const west=Math.min(...outer.map(point=>point[0]!)), east=Math.max(...outer.map(point=>point[0]!));
        const south=Math.min(...outer.map(point=>point[1]!)), north=Math.max(...outer.map(point=>point[1]!));
        if (east < bounds.getWest() || west > bounds.getEast() || north < bounds.getSouth() || south > bounds.getNorth()) continue;
        const key = JSON.stringify([feature.properties.render_height,feature.properties.render_min_height,coordinates]);
        parts.set(key,{type:'Feature',properties:{...feature.properties,current_selection:selectors.some(area=>polygonsIntersect(coordinates,area))},geometry:{type:'Polygon',coordinates}});
      }
    }
    const keys = [...parts.keys()].sort();
    const signature = `${this.selected}/${keys.join('|')}`;
    if (signature === this.buildingSelectionSignature) return false;
    this.buildingSelectionSignature = signature;
    // Reuse only real map footprints and their original height/base properties.
    // No estimated buildings, heights, market observations or persistent data.
    this.selectedBuildings = keys.map(key => parts.get(key)!);
    source.setData({type:'FeatureCollection',features:this.selectedBuildings});
    return true;
  }

  private draw(): void {
    if (!this.overlay || !this.geometry) return;
    const observations = new globalThis.Map(this.market?.observations.map(o => [o.area_id, o]) ?? []);
    const status = (feature: {properties: AreaFeature['properties']}): Observation | undefined => observations.get(feature.properties.area_id);
    const color = (feature: {properties: AreaFeature['properties']}): [number, number, number, number] => {
      const observation = status(feature);
      if (observation?.status === 'conflict') return [193, 144, 214, 32];
      if (observation?.status !== 'available' || observation.value === null) return [138, 160, 172, 20];
      return [48, 177, 181, 19];
    };
    this.overlay.setProps({layers: [
      new GeoJsonLayer<AreaFeature['properties']>({
        id: 'illustrative-area-selectors', data: this.geometry, pickable: true, filled: true, stroked: true,
        parameters: {depthCompare: 'always', depthWriteEnabled: false},
        getFillColor: color,
        getLineColor: f => status(f)?.status === 'conflict' ? [193, 144, 214, 180] : status(f)?.status === 'available' ? [99, 168, 172, 110] : [138, 160, 172, 110],
        getLineWidth: 1, lineWidthUnits: 'pixels', lineAntialiasing: true,
        updateTriggers: {getFillColor: [this.market], getLineColor: [this.market]},
        onHover: info => {
          const feature = info.object;
          this.onHover(feature?.properties.area_id ?? null, info.x, info.y);
          this.container.style.cursor = feature ? 'pointer' : '';
        }
      }),
      // Selection is a separate, non-pickable overlay: amber means current
      // choice only, even when the underlying observation is missing/conflict.
      new GeoJsonLayer<AreaFeature['properties']>({
        id: 'current-area-highlight',
        data: {type: 'FeatureCollection', features: this.geometry.features.filter(f => f.properties.area_id === this.selected)},
        pickable: false, filled: true, stroked: true,
        parameters: {depthCompare: 'always', depthWriteEnabled: false},
        getFillColor: [255, 183, 45, 55], getLineColor: [255, 194, 66, 255],
        getLineWidth: 3, lineWidthUnits: 'pixels', lineAntialiasing: true
      }),
      new TextLayer<Area>({
        id: 'illustrative-area-labels', data: this.areas, pickable: false,
        parameters: {depthCompare: 'always', depthWriteEnabled: false},
        getPosition: area => area.center, getText: area => area.id === this.selected ? `${area.name} / SELECTED` : area.name,
        getColor: area => area.id === this.selected ? [255, 215, 123, 255] : [229, 247, 245, 255],
        getSize: 14, sizeUnits: 'pixels', billboard: true,
        fontFamily: 'Arial, sans-serif', fontWeight: 700,
        getTextAnchor: area => {
          const point = this.map?.project(area.center);
          const halfWidth = (area.name.length + (area.id === this.selected ? 11 : 0)) * 4.6 + 9;
          return point && point.x < halfWidth ? 'start' : point && point.x > this.container.clientWidth - halfWidth ? 'end' : 'middle';
        }, getAlignmentBaseline: 'center',
        background: true, getBackgroundColor: area => area.id === this.selected ? [37, 34, 25, 245] : [15, 39, 50, 229], backgroundPadding: [9, 6],
        updateTriggers: {getText: [this.selected], getColor: [this.selected], getBackgroundColor: [this.selected], getTextAnchor: [this.selected,this.camera(),this.container.clientWidth]}
      })
    ]});
  }

  private prefersReducedMotion(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  focus(area: AreaId): void {
    const center = this.areas.find(item => item.id === area)?.center;
    if (!center || !this.map) return;
    this.map.resize();
    const target = {center, zoom: 14.9, pitch: 60, bearing: this.map.getBearing()};
    if (this.prefersReducedMotion()) this.map.jumpTo(target);
    else this.map.easeTo({...target, duration: 850});
  }

  reset(): void {
    if (!this.map) return;
    if (this.prefersReducedMotion()) this.map.jumpTo(overview);
    else this.map.easeTo({...overview, duration: 850});
  }

  zoomBy(delta: number): void {
    if (!this.map || !Number.isFinite(delta)) return;
    const zoom = Math.max(this.map.getMinZoom(), Math.min(this.map.getMaxZoom(), this.map.getZoom() + delta));
    if (this.prefersReducedMotion()) this.map.jumpTo({zoom});
    else this.map.easeTo({zoom, duration: 350});
  }

  rotateBy(delta: number): void {
    if (!this.map || !Number.isFinite(delta)) return;
    const bearing = this.map.getBearing() + delta;
    if (this.prefersReducedMotion()) this.map.jumpTo({bearing});
    else this.map.easeTo({bearing, duration: 350});
  }

  setPitch(value: number): void {
    if (!this.map || !Number.isFinite(value)) return;
    const pitch = Math.max(this.map.getMinPitch(), Math.min(this.map.getMaxPitch(), value));
    if (this.prefersReducedMotion()) this.map.jumpTo({pitch});
    else this.map.easeTo({pitch, duration: 350});
  }

  private camera(): CameraState {
    if (!this.map) return {...overview};
    const center = this.map.getCenter();
    return {zoom: this.map.getZoom(), bearing: this.map.getBearing(), pitch: this.map.getPitch(), center: [center.lng, center.lat]};
  }

  private renderedBuildingCount(): number {
    if (!this.map?.getLayer(buildingLayer)) return 0;
    // Bounded central-viewport diagnostic, not a building inventory or coverage
    // count. Avoid decoding every city polygon merely to read the camera pose.
    const x=this.container.clientWidth/2, y=this.container.clientHeight/2;
    return this.map.queryRenderedFeatures([[Math.max(0,x-200),Math.max(0,y-200)],[Math.min(this.container.clientWidth,x+200),Math.min(this.container.clientHeight,y+200)]],{layers:[buildingLayer]}).length;
  }

  debug(): {webgl2: boolean; interleaved: boolean; deckCanvasShared: boolean; baseMapStatus: BasemapStatus; geometryCount: number; buildings3d: boolean; renderedBuildingCount: number; moving: boolean; zoom: number; bearing: number; pitch: number; center: [number, number]} {
    const canvas = this.map?.getCanvas();
    return {
      webgl2: Boolean(canvas?.getContext('webgl2')),
      interleaved: Boolean(this.overlay),
      deckCanvasShared: Boolean(canvas && this.overlay?.getCanvas() === canvas),
      baseMapStatus: this.basemapStatus,
      geometryCount: this.geometry?.features.length ?? 0,
      buildings3d: Boolean(this.map?.getLayer(buildingLayer)),
      renderedBuildingCount: this.renderedBuildingCount(),
      moving: this.map?.isMoving() ?? false,
      ...this.camera()
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
