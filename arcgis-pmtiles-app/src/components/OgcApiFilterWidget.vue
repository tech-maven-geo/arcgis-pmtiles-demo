<template>
  <div v-if="visible && activeLayerInfo" class="ogc-filter-widget">
    <h4>Filter OGC Layer: {{ activeLayerInfo.collectionId }}</h4>
    <div class="form-group">
      <label for="qSearch">Text Search (parameter: q):</label>
      <input type="text" id="qSearch" v-model="q" placeholder="Enter search text" class="form-control" />
    </div>
    <div class="form-group">
      <label for="cqlFilter">CQL Filter (parameter: filter):</label>
      <input type="text" id="cqlFilter" v-model="cqlFilter" placeholder="e.g., propertyName > 100 OR name LIKE 'A%'" class="form-control" />
      <small>Uses 'filter-lang=cql2-text'</small>
    </div>
    <div class="form-group">
        <label>Spatial Filter (parameter: bbox):</label>
        <button @click="applyBboxFilter" class="btn btn-secondary btn-sm">Use Current Map Extent</button>
        <input type="text" v-model="bbox" placeholder="minLon,minLat,maxLon,maxLat (WGS84)" class="form-control" title="BBOX (WGS84): minLon,minLat,maxLon,maxLat" />
        <small>BBOX should be in WGS84 (EPSG:4326).</small>
    </div>
     <div class="form-group">
        <label for="limit">Max Features (parameter: limit):</label>
        <input type="number" id="limit" v-model.number="limit" min="1" max="10000" class="form-control" />
    </div>
    <div class="widget-actions">
      <button @click="triggerApplyFilters" class="btn btn-primary">Apply Filters</button>
      <button @click="triggerClearFiltersAndReload" class="btn btn-info">Clear Filters & Reload</button>
      <button @click="$emit('close-widget')" class="btn btn-light">Close</button>
    </div>
  </div>
</template>

<script>
import { project } from "@arcgis/core/geometry/projection.js";
import Extent from "@arcgis/core/geometry/Extent.js";
import SpatialReference from "@arcgis/core/geometry/SpatialReference.js";

export default {
  name: "OgcApiFilterWidget",
  props: {
    visible: Boolean,
    mapView: Object,
    activeLayerInfo: Object, // { serviceUrl, collectionId, layerId (to identify existing layer) }
  },
  emits: ['apply-ogc-filter', 'close-widget'],
  data() {
    return {
      q: "",
      cqlFilter: "",
      bbox: "",
      limit: 100,
    };
  },
  watch: {
    activeLayerInfo(newInfo, oldInfo) {
      if (newInfo?.collectionId !== oldInfo?.collectionId || newInfo?.serviceUrl !== oldInfo?.serviceUrl) {
        this.resetLocalFilters();
      }
    },
    // If widget becomes visible with new layer info, reset local state
    visible(isVisible) {
        if (isVisible && this.activeLayerInfo) {
            // Could reset filters here if desired when widget is re-opened for a layer
            // For now, filters persist while widget is for the same layer
        }
    }
  },
  methods: {
    async applyBboxFilter() {
      if (!this.mapView || !this.mapView.extent) {
        alert("Map view or extent is not available.");
        return;
      }
      let extentToUse = this.mapView.extent;
      const wgs84 = new SpatialReference({ wkid: 4326 });

      if (!this.mapView.spatialReference.equals(wgs84)) {
        // console.log("Projecting extent to WGS84 for BBOX filter.");
        if (!project.isLoaded()) {
            await project.load();
        }
        try {
            extentToUse = project.project(extentToUse, wgs84);
        } catch (e) {
            alert("Failed to project map extent to WGS84 for BBOX filter. Ensure projection module is loaded and extent is valid.");
            console.error("Projection error:", e);
            return;
        }
      }
      if (extentToUse) {
        this.bbox = `${extentToUse.xmin.toFixed(6)},${extentToUse.ymin.toFixed(6)},${extentToUse.xmax.toFixed(6)},${extentToUse.ymax.toFixed(6)}`;
      } else {
         alert("Failed to get a valid extent in WGS84.");
      }
    },
    triggerApplyFilters() {
      if (!this.activeLayerInfo) return;
      const queryParams = { limit: this.limit > 0 ? this.limit : 100 }; // Ensure limit is positive
      if (this.q && this.q.trim() !== "") queryParams.q = this.q.trim();
      if (this.cqlFilter && this.cqlFilter.trim() !== "") {
        queryParams.filter = this.cqlFilter.trim();
        queryParams["filter-lang"] = "cql2-text";
      }
      if (this.bbox && this.bbox.trim() !== "") {
        // Validate BBOX format (simple check)
        const parts = this.bbox.split(',');
        if (parts.length === 4 && parts.every(part => !isNaN(parseFloat(part)))) {
            queryParams.bbox = this.bbox.trim();
        } else {
            alert("BBOX format is invalid. Should be minLon,minLat,maxLon,maxLat in WGS84.");
            return; // Don't apply filter with invalid bbox
        }
      }

      this.$emit('apply-ogc-filter', {
        serviceUrl: this.activeLayerInfo.serviceUrl,
        collectionId: this.activeLayerInfo.collectionId,
        queryParams: queryParams,
        layerId: this.activeLayerInfo.layerId
      });
    },
    triggerClearFiltersAndReload() {
        this.resetLocalFilters();
        if (!this.activeLayerInfo) return;
        this.$emit('apply-ogc-filter', {
            serviceUrl: this.activeLayerInfo.serviceUrl,
            collectionId: this.activeLayerInfo.collectionId,
            queryParams: { limit: this.limit > 0 ? this.limit : 100 },
            layerId: this.activeLayerInfo.layerId
        });
    },
    resetLocalFilters() {
        this.q = "";
        this.cqlFilter = "";
        this.bbox = "";
        // this.limit = 100; // Optionally reset limit too
    }
  },
};
</script>

<style scoped>
.ogc-filter-widget {
  position: absolute;
  top: 10px; /* Adjust based on DataSourceInput height or other elements */
  right: 10px; /* Position on the right */
  z-index: 999;
  background-color: #f8f9fa; /* Lighter background */
  padding: 15px;
  border: 1px solid #dee2e6; /* Lighter border */
  border-radius: 5px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  font-family: Arial, sans-serif;
  max-width: 380px;
  max-height: calc(100vh - 100px); /* Max height with some padding */
  overflow-y: auto; /* Scroll if content exceeds max height */
}
.ogc-filter-widget h4 {
    margin-top: 0;
    margin-bottom: 15px;
    font-size: 1.1em;
    color: #333;
}
.form-group {
  margin-bottom: 12px;
}
.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: bold;
  font-size: 0.9em;
  color: #555;
}
.form-group .form-control { /* Common class for inputs */
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  box-sizing: border-box;
  font-size: 0.9em;
}
.form-group input[type="text"]:focus,
.form-group input[type="number"]:focus {
  border-color: #80bdff;
  box-shadow: 0 0 0 0.2rem rgba(0,123,255,.25);
}
.form-group small {
    font-size: 0.8em;
    color: #6c757d;
    display: block;
    margin-top: 3px;
}

.widget-actions button {
  margin-right: 8px;
  margin-top: 10px;
}

/* Basic Bootstrap-like button styling */
.btn {
  display: inline-block;
  font-weight: 400;
  text-align: center;
  vertical-align: middle;
  cursor: pointer;
  user-select: none;
  background-color: transparent;
  border: 1px solid transparent;
  padding: .375rem .75rem;
  font-size: 1rem;
  line-height: 1.5;
  border-radius: .25rem;
  transition: color .15s ease-in-out,background-color .15s ease-in-out,border-color .15s ease-in-out,box-shadow .15s ease-in-out;
}
.btn-primary { color: #fff; background-color: #007bff; border-color: #007bff; }
.btn-primary:hover { background-color: #0056b3; border-color: #0056b3; }
.btn-secondary { color: #fff; background-color: #6c757d; border-color: #6c757d; }
.btn-secondary:hover { background-color: #545b62; border-color: #545b62; }
.btn-info { color: #fff; background-color: #17a2b8; border-color: #17a2b8; }
.btn-info:hover { background-color: #117a8b; border-color: #117a8b; }
.btn-light { color: #212529; background-color: #f8f9fa; border-color: #f8f9fa; }
.btn-light:hover { background-color: #e2e6ea; border-color: #dae0e5; }
.btn-sm { padding: .25rem .5rem; font-size: .875rem; line-height: 1.5; border-radius: .2rem; }

</style>
