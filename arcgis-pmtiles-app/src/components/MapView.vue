<template>
  <div class="map-container" ref="mapViewNode">
    <DataSourceInput @add-layer="handleLayerAddition" />
    <OgcApiFilterWidget
      :visible="showOgcFilterWidget"
      :map-view="view"
      :active-layer-info="activeOgcLayerInfo"
      @apply-ogc-filter="handleOgcFilterApply"
      @close-widget="closeOgcFilterWidget"
    />
    <AttributeTable
      :visible="showAttributeTable"
      :features="attributeTableData.features"
      :fields="attributeTableData.fields"
      :title="attributeTableData.title"
      :object-id-field="attributeTableData.objectIdField"
      @row-selected="handleTableRowSelected"
      @close-table="closeAttributeTable"
      ref="attributeTableRef"
    />
    <OgcRecordsStacSearchWidget
      :visible="showStacSearchWidget"
      :map-view="view"
      @execute-search="handleStacSearchExecute"
      @close-widget="closeStacSearchWidget"
      ref="stacSearchWidgetRef"
    />
    <div v-if="clickInfo" class="click-info-panel">
        <button @click="clickInfo = null" class="close-click-info">&times;</button>
        <strong>Map Click Info:</strong><br/>
        <span v-html="clickInfo"></span>
    </div>
  </div>
</template>

<script>
import Map from "@arcgis/core/Map.js";
import MapView from "@arcgis/core/views/MapView.js";
import BasemapToggle from "@arcgis/core/widgets/BasemapToggle.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import "@arcgis/core/assets/esri/themes/light/main.css";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";
import Point from "@arcgis/core/geometry/Point.js"; // Keep for click inspection if needed

import DataSourceInput from "./DataSourceInput.vue";
import OgcApiFilterWidget from "./OgcApiFilterWidget.vue";
import AttributeTable from "./AttributeTable.vue";
import OgcRecordsStacSearchWidget from "./OgcRecordsStacSearchWidget.vue";

import PMTilesLayer from "../layers/PMTilesLayer.js";
import PMTilesVectorLayer from "../layers/PMTilesVectorLayer.js";
import PMTilesTerrainLayer from "../layers/PMTilesTerrainLayer.js";
import MapzenTerrariumLayer from "../layers/MapzenTerrariumLayer.js";
import { loadFlatGeobuf } from "../utils/flatgeobufLoader.js";
import { createCogLayer } from "../utils/cogLoader.js";
import { loadOgcApiFeatures } from "../utils/ogcApiFeaturesLoader.js";
import { searchOgcRecordsStac } from "../utils/ogcRecordsStacLoader.js";
import { loadInitialCopcPoints } from "../utils/copcLoader.js"; // Import COPC loader

import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import SimpleRenderer from "@arcgis/core/renderers/SimpleRenderer.js";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol.js";
import SimpleLineSymbol from "@arcgis/core/symbols/SimpleLineSymbol.js";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol.js";
import SpatialReference from "@arcgis/core/geometry/SpatialReference.js";
// PointCloudRenderers are for PointCloudLayer, not GraphicsLayer with points.
// For GraphicsLayer, use SimpleRenderer with SimpleMarkerSymbol or unique value renderer.

let Lerc; // Lazy load for LERC package

export default {
  name: "MapView",
  components: { DataSourceInput, OgcApiFilterWidget, AttributeTable, OgcRecordsStacSearchWidget },
  data() {
    return {
      map: null, view: null, showOgcFilterWidget: false, activeOgcLayerInfo: null,
      lastOgcLayerId: null, showAttributeTable: false,
      attributeTableData: { features: [], fields: [], title: "", layerId: null, objectIdField: "OBJECTID" },
      highlightHandle: null, showStacSearchWidget: false, stacResultsLayer: null,
      clickInfo: null, activeInspectLayerId: null, mapClickHandler: null,
      copcResultsLayer: null, // Layer for COPC graphics
    };
  },
  mounted() {
    this.map = new Map({ basemap: "streets-navigation-vector" });

    this.stacResultsLayer = new GraphicsLayer({ /* ... config ... */ id: "stac-search-results-layer", title: "STAC Search Results", listMode: "hide-children", popupEnabled: true, popupTemplate: { title: "{title}", content: [{type: "fields", fieldInfos: [ { fieldName: "id", label: "ID" }, { fieldName: "datetime", label: "Date/Time" }, {fieldName: "assets", label: "Assets (JSON)"}, {fieldName: "links", label: "Links (JSON)"}]}], outFields: ["*"]} });
    this.map.add(this.stacResultsLayer);

    this.copcResultsLayer = new GraphicsLayer({ // Initialize COPC layer
        id: "copc-results-layer",
        title: "COPC Points",
        listMode: "hide-children", // Typically hide raw points from layer list
        renderer: new SimpleRenderer({ // Basic renderer for points
            symbol: new SimpleMarkerSymbol({
                style: "circle",
                color: [50, 150, 255, 0.7], // Blueish points
                size: "2px", // Small points for point cloud feel
                outline: null
            })
        }),
        // For actual point cloud rendering with varying colors/sizes by attribute,
        // a UniqueValueRenderer or ClassBreaksRenderer would be used, or PointCloud*Renderers on a PointCloudLayer.
    });
    this.map.add(this.copcResultsLayer);

    this.view = new MapView({ /* ... config ... */ container: this.$refs.mapViewNode, map: this.map, center: [-98.5795, 39.8283], zoom: 4, popup: { dockEnabled: true, dockOptions: { breakpoint: false, position: "top-right" }, highlightEnabled: true, autoOpenEnabled: false }});
    const basemapToggle = new BasemapToggle({ view: this.view, nextBasemap: "hybrid" });
    this.view.ui.add(basemapToggle, "bottom-right");

    this.view.when(() => { /* ... UI buttons setup ... */
        const uiButtonConfigs = [
            { id: "ogc-filter-toggle-button", text: "OGC Filter", onClick: () => { if (this.lastOgcLayerId && this.activeOgcLayerInfo) { this.showOgcFilterWidget = !this.showOgcFilterWidget; } else { alert("Add OGC API Features layer first."); }}},
            { id: "attribute-table-toggle-button", text: "Table", onClick: () => { const targetId = this.activeOgcLayerInfo?.layerId || this.lastOgcLayerId; if (targetId) { this.toggleAttributeTableForLayer(targetId); } else { alert("Add Feature layer first."); }}},
            { id: "stac-search-toggle-button", text: "STAC Search", onClick: () => { this.showStacSearchWidget = !this.showStacSearchWidget; }}
        ];
        uiButtonConfigs.forEach(cfg => { const btn = document.createElement("button"); btn.innerText = cfg.text; btn.className = "esri-widget esri-widget--button"; btn.id = cfg.id; btn.onclick = cfg.onClick; this.view.ui.add(btn, "top-right"); });
        reactiveUtils.watch(()=>this.view.popup.selectedFeature,g=>{ if(this.$refs.attributeTableRef){if(g&&g.layer&&this.showAttributeTable&&this.attributeTableData.layerId===g.layer.id){const oid=g.layer.objectIdField||this.attributeTableData.objectIdField;this.$refs.attributeTableRef.selectedFeatureUid=g.attributes[oid];}else if(!g){this.$refs.attributeTableRef.clearSelection();}}});
        this.mapClickHandler = this.view.on("click", this.handleMapClickForInspection.bind(this));
    });
  },
  beforeUnmount() { /* ... existing cleanup ... */
    if (this.view) { ["ogc-filter-toggle-button", "attribute-table-toggle-button", "stac-search-toggle-button"].forEach(id => { const el = this.view.ui.find(id); if (el) this.view.ui.remove(el); }); if (this.highlightHandle) this.highlightHandle.remove(); if (this.mapClickHandler) { this.mapClickHandler.remove(); this.mapClickHandler = null; } this.view.destroy(); this.view = null; }
    if (this.map) { if (this.stacResultsLayer) this.map.remove(this.stacResultsLayer); if (this.copcResultsLayer) this.map.remove(this.copcResultsLayer); }
    this.map = null; this.stacResultsLayer = null; this.copcResultsLayer = null;
  },
  methods: {
    async handleLayerAddition(layerConfig) {
      if (!this.map || !this.view) { alert("Map or View is not ready."); return; }
      const { type } = layerConfig; let newLayer; let layerTitle = "Layer"; let layerId = `${type}-${Date.now()}`;
      try {
        switch (type) {
            case "pmtiles-raster": layerTitle = "PMTiles Raster"; newLayer = new PMTilesLayer({ id: layerId, url: layerConfig.url, title: layerTitle }); this.activeInspectLayerId = layerId; break;
            case "pmtiles-vector": layerTitle = "PMTiles Vector (Data)"; newLayer = new PMTilesVectorLayer({ id: layerId, url: layerConfig.url, title: layerTitle }); alert(`${layerTitle} added...`); break;
            case "pmtiles-terrain": layerTitle = "PMTiles Terrain (Data)"; newLayer = new PMTilesTerrainLayer({ id: layerId, url: layerConfig.url, title: layerTitle }); alert(`${layerTitle} added...`); this.activeInspectLayerId = layerId; break;
            case "mapzen-terrarium-png": layerTitle = "Mapzen Terrarium"; newLayer = new MapzenTerrariumLayer({  id: layerId, urlTemplate: layerConfig.urlTemplate, apiKey: layerConfig.apiKey, title: layerTitle }); this.activeInspectLayerId = layerId; break;
            case "cog": layerTitle = "COG Layer"; newLayer = createCogLayer(layerConfig.url, { id: layerId, title: layerTitle }); if (!newLayer) { alert("Failed to create COG layer."); return; } this.activeInspectLayerId = layerId; break;
            case "flatgeobuf": { /* ... FGB logic as before, including popupTemplate ... */
                layerTitle = "FlatGeobuf Layer"; const { graphics, header, error } = await loadFlatGeobuf(layerConfig.url);
                if (error || !graphics || graphics.length === 0) { alert(`Load FGB err: ${error?.message||'No graphics'}`); return; }
                let oidc = 0; const sA = graphics[0].attributes||{}; const fields = [{name:"OBJECTID",type:"oid",alias:"OBJECTID"}];
                for(const k in sA){if(Object.prototype.hasOwnProperty.call(sA,k)){let ft="string";if(typeof sA[k]==='number')ft="double";fields.push({name:k,type:ft,alias:k});}}
                graphics.forEach(g=>{g.attributes.OBJECTID=oidc++; if(g.geometry&&!g.geometry.spatialReference){const srId=header?.crs?.code;g.geometry.spatialReference=srId?new SpatialReference({wkid:parseInt(srId)}):new SpatialReference({wkid:4326});}});
                const gType=graphics[0].geometry?.type||"unknown"; let dSym;
                switch(gType){case "point":case "multipoint":dSym=new SimpleMarkerSymbol({style:"circle",color:[227,139,79,0.8],size:"8px",outline:{color:[255,255,255],width:1}});break;case "polyline":dSym=new SimpleLineSymbol({color:[79,129,227,0.8],width:"2px"});break;case "polygon":dSym=new SimpleFillSymbol({color:[79,227,139,0.5],style:"solid",outline:{color:[50,50,50],width:"1px"}});break;default:dSym=new SimpleMarkerSymbol({style:"x",color:[255,0,0,0.8],size:"10px"});}
                newLayer=new FeatureLayer({id:layerId,source:graphics,objectIdField:"OBJECTID",fields,geometryType:gType,title:layerTitle,renderer:new SimpleRenderer({symbol:dSym}),spatialReference:graphics[0].geometry.spatialReference||this.view.spatialReference, popupTemplate: createGenericPopupTemplate(fields, layerTitle), popupEnabled: true});
                this.prepareAttributeTableData(newLayer); this.lastOgcLayerId=layerId; this.activeInspectLayerId = layerId;
            } break;
            case "ogc-api-features": { /* ... OGC Features logic as before, including popupTemplate ... */
                layerTitle = `OGC - ${layerConfig.collectionId}`; const { graphics, error: ogcError } = await loadOgcApiFeatures(layerConfig.serviceUrl,layerConfig.collectionId,{limit:250},layerConfig.auth);
                if (ogcError || !graphics || graphics.length === 0) { alert(`Load OGC err: ${ogcError?.message||'No feats'}`); return; }
                let oidc=0; const sA=graphics.length>0?graphics[0].attributes||{}:{}; const flds=[{name:"OBJECTID",type:"oid",alias:"OBJECTID"}];
                for(const k in sA){if(Object.prototype.hasOwnProperty.call(sA,k)){let ft="string";if(typeof sA[k]==='number')ft="double";flds.push({name:k,type:ft,alias:k});}}
                graphics.forEach(g=>{g.attributes.OBJECTID=oidc++;}); const gType=graphics.length>0?graphics[0].geometry?.type||"unknown":"unknown"; let dSym;
                switch(gType){case "point":case "multipoint":dSym=new SimpleMarkerSymbol({style:"diamond",color:[139,79,227,0.8],size:"10px",outline:{color:[255,255,255],width:1}});break;case "polyline":dSym=new SimpleLineSymbol({color:[227,79,129,0.8],width:"2.5px"});break;case "polygon":dSym=new SimpleFillSymbol({color:[139,227,79,0.5],style:"solid",outline:{color:[50,50,50],width:"1px"}});break;default:dSym=new SimpleMarkerSymbol({style:"x",color:[255,0,0,0.8],size:"10px"});}
                newLayer=new FeatureLayer({id:layerId,source:graphics,objectIdField:"OBJECTID",fields:flds,geometryType:gType,title:layerTitle,renderer:new SimpleRenderer({symbol:dSym}),spatialReference:{wkid:4326}, popupTemplate: createGenericPopupTemplate(flds, layerTitle), popupEnabled: true});
                this.activeOgcLayerInfo={serviceUrl:layerConfig.serviceUrl,collectionId:layerConfig.collectionId,layerId:layerId,auth:layerConfig.auth,originalFields:flds,originalRenderer:new SimpleRenderer({symbol:dSym}),originalGeometryType:gType};
                this.lastOgcLayerId=layerId; this.showOgcFilterWidget=true; this.prepareAttributeTableData(newLayer); this.activeInspectLayerId = layerId;
            } break;
            case "copc": // New case for COPC
                layerTitle = "COPC Point Cloud";
                alert("Loading COPC data... This may take a moment and uses simulated points due to loader issues.");
                const { graphics: copcGraphics, pointCount, error: copcError } = await loadInitialCopcPoints(layerConfig.url);
                if (copcError) {
                    alert(`Failed to load COPC data: ${copcError}`);
                    return;
                }
                if (this.copcResultsLayer) {
                    this.copcResultsLayer.removeAll();
                    if (copcGraphics && copcGraphics.length > 0) {
                        this.copcResultsLayer.addMany(copcGraphics);
                        this.view.goTo(this.copcResultsLayer.fullExtent || copcGraphics).catch(e => console.warn("Zoom to COPC failed:", e));
                        alert(`COPC layer added with ${pointCount} (simulated) points. Displaying on map.`);
                    } else {
                        alert("COPC loaded, but no points to display (or simulation returned none).");
                    }
                }
                // No 'newLayer' is created here that gets added to map.add() directly in this flow,
                // as copcResultsLayer is already on the map.
                // We just update its source.
                this.activeInspectLayerId = this.copcResultsLayer.id; // Allow inspection if we implement it
                break;
            default: alert(`Unsupported type: ${type}`); return;
        }
        if(newLayer){this.map.add(newLayer);alert(`${newLayer.title||type} added.`);newLayer.when().then(()=>{if(this.view&&newLayer.fullExtent)this.view.goTo(newLayer.fullExtent).catch(e=>console.warn("Zoom err:",e.message));}).catch(e=>console.warn(`${newLayer.title} issues:`,e.message));}
      } catch (err) { console.error(`Add layer err ${type}:`,err); alert(`Add layer '${layerTitle}' err: ${err.message}`); }
    },
    async handleOgcFilterApply(filterConfig) { /* ... existing, ensure popupTemplate on newFilteredLayer ... */
        if(!this.map||!this.activeOgcLayerInfo||!this.activeOgcLayerInfo.layerId){alert("No active OGC layer.");return;}
        const existingLayer=this.map.findLayerById(this.activeOgcLayerInfo.layerId);
        if(!existingLayer||!(existingLayer.type==="feature")){alert("Target OGC layer not found.");return;}
        try { const {graphics,error}=await loadOgcApiFeatures(filterConfig.serviceUrl,filterConfig.collectionId,filterConfig.queryParams,this.activeOgcLayerInfo.auth);
            if(error){alert(`Filter OGC err: ${error.message}`);return;}
            this.map.remove(existingLayer); let oidc=0; const fields=this.activeOgcLayerInfo.originalFields||[{name:"OBJECTID",type:"oid"}];
            if(graphics.length>0&&!this.activeOgcLayerInfo.originalFields){/*re-derive fields*/} graphics.forEach(g=>{g.attributes.OBJECTID=oidc++;});
            const newFilteredLayer=new FeatureLayer({id:this.activeOgcLayerInfo.layerId,source:graphics,objectIdField:"OBJECTID",fields:fields,geometryType:this.activeOgcLayerInfo.originalGeometryType||(graphics.length>0?graphics[0].geometry?.type||"unknown":"unknown"),title:`OGC - ${filterConfig.collectionId} (F ${Date.now()%10000})`,renderer:this.activeOgcLayerInfo.originalRenderer,spatialReference:{wkid:4326}, popupTemplate: createGenericPopupTemplate(fields, `OGC - ${filterConfig.collectionId} (Filtered)`), popupEnabled: true});
            this.map.add(newFilteredLayer); this.prepareAttributeTableData(newFilteredLayer);
            alert(`OGC layer '${filterConfig.collectionId}' updated. Feats: ${graphics.length}`);
        } catch(err){console.error("Apply OGC filter err:",err);alert(`Apply OGC filter err: ${err.message}`);}
    },
    prepareAttributeTableData(layer) { /* ... same ... */
        if(layer&&layer.type==="feature"&&layer.source&&Array.isArray(layer.source)){ this.attributeTableData={features:layer.source,fields:layer.fields||[],title:layer.title||"Attr Table",layerId:layer.id,objectIdField:layer.objectIdField||"OBJECTID"}; }
        else { this.attributeTableData={features:[],fields:[],title:"",layerId:null,objectIdField:"OBJECTID"};}
    },
    toggleAttributeTableForLayer(layerId){ /* ... same ... */
        if(this.showAttributeTable&&this.attributeTableData.layerId===layerId){this.showAttributeTable=false;}
        else{const layer=this.map.findLayerById(layerId);if(layer&&(layer.type==="feature"||(layer.graphics&&layer.isInstanceOf(GraphicsLayer)))){this.prepareAttributeTableData(layer);this.showAttributeTable=true;}else{alert("Layer not FeatureLayer/GraphicsLayer or not found.");this.showAttributeTable=false;}}
    },
    handleTableRowSelected(graphic){ /* ... same ... */
        if(!this.view||!graphic)return; this.view.goTo({target:graphic.geometry}).catch(e=>console.warn("Zoom err:",e));
        this.view.whenLayerView(graphic.layer).then(lv=>{if(this.highlightHandle)this.highlightHandle.remove();this.highlightHandle=lv.highlight(graphic);this.view.popup.open({features:[graphic],location:graphic.geometry.type==="point"?graphic.geometry:graphic.geometry.extent.center});});
    },
    closeAttributeTable(){ /* ... same ... */ this.showAttributeTable=false;if(this.highlightHandle){this.highlightHandle.remove();this.highlightHandle=null;}if(this.view&&this.view.popup)this.view.popup.close();},
    closeOgcFilterWidget(){this.showOgcFilterWidget=false;},
    async handleStacSearchExecute(searchConfig) { /* ... same ... */
        if (!this.stacResultsLayer) { console.error("STAC results layer not initialized."); if (this.$refs.stacSearchWidgetRef) { this.$refs.stacSearchWidgetRef.displayResults({ error: "Results layer not ready." }); } return; }
        this.stacResultsLayer.removeAll();
        const { graphics, items, totalMatched, error } = await searchOgcRecordsStac( searchConfig.serviceUrl, searchConfig.queryParams, searchConfig.isStac, null );
        if (this.$refs.stacSearchWidgetRef) { this.$refs.stacSearchWidgetRef.displayResults({ items, graphics, totalMatched, error }); }
        if (graphics && graphics.length > 0) { this.stacResultsLayer.addMany(graphics); if (graphics.length === 1 && graphics[0].geometry) { this.view.goTo(graphics[0].geometry.extent.expand(2)).catch(e=>console.warn("Zoom err:",e));} else if (graphics.length > 1) {this.view.goTo(graphics).catch(e=>console.warn("Zoom err:",e));}}
    },
    closeStacSearchWidget() { this.showStacSearchWidget = false; },
    async handleMapClickForInspection(event) { /* ... same, ensure Lerc is defined or handled ... */
        if (!this.view || !this.activeInspectLayerId) { this.clickInfo = "No inspectable layer active..."; return; }
        this.clickInfo = "<i>Querying data...</i>"; const layer = this.map.findLayerById(this.activeInspectLayerId);
        if (!layer) { this.clickInfo = `Layer ${this.activeInspectLayerId} not found.`; return; }
        const mapPoint = event.mapPoint;
        try {
            if (layer instanceof PMTilesTerrainLayer) {
                if (!Lerc && typeof require === 'function') { try { Lerc = require('lerc');} catch(e) {console.warn("Lerc pkg not loaded.");}}
                if (Lerc) { this.clickInfo = `LERC PMTiles Layer ('${layer.title}') clicked. LERC decoding logic needed.`; }
                else { this.clickInfo = `LERC PMTiles Layer ('${layer.title}') clicked. <b>LERC package not available.</b>`; }
            } else if (layer instanceof MapzenTerrariumLayer) { this.clickInfo = `Mapzen Layer ('${layer.title}') clicked. Elevation decoding needed.`; }
            else if (layer instanceof PMTilesLayer) { this.clickInfo = `Raster PMTiles Layer ('${layer.title}') clicked. RGBA inspection needed.`; }
            else if (layer.declaredClass === "esri.layers.ImageryTileLayer") { const v = await layer.identify(mapPoint); if (v && v.value) { this.clickInfo = `COG ('${layer.title}') Pixel Value(s): ${v.value.join(", ")} at ${mapPoint.latitude.toFixed(4)}, ${mapPoint.longitude.toFixed(4)}`; } else { this.clickInfo = `No COG data at point for '${layer.title}'.`; }}
            else { this.clickInfo = `Clicked on '${layer.title}'. Inspection for this type not implemented.`; }
        } catch (e) { console.error("Inspect err:", e); this.clickInfo = `Inspect err: ${e.message}`; }
    }
  }
};
</script>

<style scoped>
.map-container{padding:0;margin:0;height:100vh;width:100vw;position:relative;}
:global(.esri-widget--button){margin:5px;}
.click-info-panel { position: absolute; bottom: 10px; right: 10px; background-color: rgba(255,255,255,0.9); padding: 10px; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); z-index: 1000; max-width: 300px; font-size: 0.9em;}
.close-click-info { position: absolute; top: 2px; right: 5px; background: none; border: none; font-size: 1.2em; cursor: pointer;}
</style>
