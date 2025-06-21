<template>
  <div v-if="visible" class="ogc-records-stac-widget">
    <h4>OGC Records / STAC Search</h4>
    <div class="form-group">
      <label for="stacServiceUrl">Service URL (STAC API root or OGC Records endpoint):</label>
      <input type="text" id="stacServiceUrl" v-model="serviceUrl" placeholder="Enter API endpoint URL" class="form-control"/>
    </div>
    <div class="form-group">
      <label for="stacQSearch">Text Search (parameter: q):</label>
      <input type="text" id="stacQSearch" v-model="q" placeholder="Search text (e.g., Sentinel-2)" class="form-control"/>
    </div>
    <div class="form-group">
      <label>Spatial Filter (parameter: bbox):</label>
      <button @click="setBboxFromMap" class="btn btn-secondary btn-sm">Use Current Map Extent</button>
      <input type="text" v-model="bbox" placeholder="minLon,minLat,maxLon,maxLat (WGS84)" title="BBOX (WGS84)" class="form-control"/>
      <small>BBOX should be in WGS84 (EPSG:4326).</small>
    </div>
    <div class="form-group">
      <label for="stacLimitRecords">Max Results (parameter: limit):</label>
      <input type="number" id="stacLimitRecords" v-model.number="limit" min="1" max="500" class="form-control"/>
    </div>

    <!-- Basic Datetime filter -->
    <div class="form-group">
        <label for="stacDatetime">Datetime Filter (STAC: datetime):</label>
        <input type="text" id="stacDatetime" v-model="datetime" placeholder="YYYY-MM-DDTHH:mm:ssZ or YYYY-MM-DD/YYYY-MM-DD" class="form-control"/>
        <small>Range: start/end, or single datetime.</small>
    </div>

    <!-- Basic Collections filter (for STAC) -->
    <div class="form-group">
        <label for="stacCollections">Collections Filter (STAC: collections, comma-separated):</label>
        <input type="text" id="stacCollections" v-model="collections" placeholder="e.g., sentinel-2-l2a,landsat-c2-l2" class="form-control"/>
    </div>


    <div class="widget-actions">
        <button @click="executeSearch" class="btn btn-primary" :disabled="isLoading || !serviceUrl.trim()">
            {{ isLoading ? 'Searching...' : 'Search' }}
        </button>
        <button @click="$emit('close-widget')" class="btn btn-light">Close</button>
    </div>

    <div v-if="searchError" class="error-message alert alert-danger">{{ searchError }}</div>

    <div v-if="resultsSummary" class="results-summary alert alert-info">
        <p>{{ resultsSummary }}</p>
        <ul v-if="results && results.length > 0">
            <li v-for="item in results.slice(0, 10)" :key="item.id || item.properties?.title">
                {{ item.properties?.title || item.id || 'Unnamed Item' }}
                <span v-if="item.properties?.datetime"> ({{ formatDate(item.properties.datetime) }})</span>
            </li>
            <li v-if="results.length > 10 && results.length < totalMatched">... and {{ results.length - 10 }} more shown out of {{ totalMatched }}.</li>
            <li v-if="results.length > 10 && results.length === totalMatched">... and {{ results.length - 10 }} more.</li>
        </ul>
    </div>

  </div>
</template>

<script>
import { project } from "@arcgis/core/geometry/projection.js";
import SpatialReference from "@arcgis/core/geometry/SpatialReference.js";
// The actual loader will be imported in MapView.vue and passed or called via events.

export default {
  name: "OgcRecordsStacSearchWidget",
  props: {
    visible: Boolean,
    mapView: Object,
  },
  emits: ['execute-search', 'close-widget'],
  data() {
    return {
      serviceUrl: "",
      q: "",
      bbox: "",
      limit: 20,
      datetime: "", // For STAC datetime query
      collections: "", // For STAC collections query (comma-separated string)
      isLoading: false,
      results: [], // Store full items/records from search
      totalMatched: 0, // Total number of records matched by the server
      searchError: null,
      resultsSummary: null,
    };
  },
  methods: {
    async setBboxFromMap() {
      if (!this.mapView || !this.mapView.extent) { alert("Map view or extent is not available."); return; }
      let extentToUse = this.mapView.extent;
      const wgs84 = new SpatialReference({ wkid: 4326 });
      if (!this.mapView.spatialReference.equals(wgs84)) {
        if (!project.isLoaded()) await project.load();
        try { extentToUse = project.project(extentToUse, wgs84); }
        catch (e) { alert("Failed to project map extent to WGS84."); console.error("Projection error:", e); return; }
      }
      if (extentToUse) this.bbox = `${extentToUse.xmin.toFixed(4)},${extentToUse.ymin.toFixed(4)},${extentToUse.xmax.toFixed(4)},${extentToUse.ymax.toFixed(4)}`;
      else alert("Failed to get a valid extent in WGS84.");
    },
    executeSearch() {
      if (!this.serviceUrl.trim()) { alert("Please enter a Service URL."); return; }
      this.isLoading = true; this.searchError = null; this.results = []; this.totalMatched = 0; this.resultsSummary = null;

      const queryParams = { limit: this.limit > 0 ? this.limit : 20 };
      if (this.q.trim()) queryParams.q = this.q.trim();
      if (this.bbox.trim()) {
         const parts = this.bbox.split(',');
         if (parts.length === 4 && parts.every(part => !isNaN(parseFloat(part)))) queryParams.bbox = this.bbox.trim();
         else { alert("BBOX format invalid. Should be minLon,minLat,maxLon,maxLat in WGS84."); this.isLoading = false; return; }
      }
      if (this.datetime.trim()) queryParams.datetime = this.datetime.trim();
      if (this.collections.trim()) queryParams.collections = this.collections.trim(); // STAC specific

      this.$emit('execute-search', {
          serviceUrl: this.serviceUrl.trim(),
          queryParams,
          // Indicate if it's likely STAC for endpoint choice (/search or /items)
          // This is a simplification; a robust client would check conformance classes.
          isStac: this.serviceUrl.toLowerCase().includes("stac") || this.serviceUrl.includes("earth-search") || this.collections.trim() !== ""
      });
    },
    // Method to be called by parent MapView with results from loader
    displayResults({ items, graphics, totalMatched, error }) {
        this.isLoading = false;
        if (error) {
            this.searchError = typeof error === 'string' ? error : error.message;
            this.resultsSummary = "Search failed.";
            this.results = [];
            this.totalMatched = 0;
        } else {
            this.results = items || [];
            this.totalMatched = totalMatched || (items ? items.length : 0);
            if (this.results.length > 0) {
                this.resultsSummary = `Found ${this.results.length} items (approx. ${this.totalMatched} total). Displaying on map.`;
            } else {
                this.resultsSummary = "No items found matching your criteria.";
            }
        }
    },
    formatDate(datetimeString) {
        if (!datetimeString) return '';
        try {
            // Handle STAC ranges by just showing the start
            const firstPart = datetimeString.split('/')[0];
            return new Date(firstPart).toLocaleDateString();
        }
        catch { return datetimeString; }
    }
  }
};
</script>

<style scoped>
.ogc-records-stac-widget { /* ... existing styles ... */
  position: absolute; top: 10px; right: 10px; width: 400px; /* Wider for more fields */
  max-width: 90vw; max-height: calc(100vh - 120px); background-color: #fff;
  padding: 15px; border: 1px solid #ccc; border-radius: 5px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.15); z-index: 1000; overflow-y: auto;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
.ogc-records-stac-widget h4 { margin-top: 0; margin-bottom: 1rem; font-size: 1.25rem; color: #333; }
.form-group { margin-bottom: 1rem; }
.form-group label { display: block; margin-bottom: .5rem; font-weight: 600; font-size: 0.9rem; color: #495057; }
.form-control { /* Common class for inputs */
  display: block; width: 100%; padding: .375rem .75rem; font-size: 1rem;
  line-height: 1.5; color: #495057; background-color: #fff;
  background-clip: padding-box; border: 1px solid #ced4da;
  border-radius: .25rem; transition: border-color .15s ease-in-out,box-shadow .15s ease-in-out;
  box-sizing: border-box; /* Ensure padding doesn't expand width */
}
.form-control:focus { color: #495057; background-color: #fff; border-color: #80bdff; outline: 0; box-shadow: 0 0 0 .2rem rgba(0,123,255,.25); }
.form-group small { font-size: 0.8em; color: #6c757d; display: block; margin-top: .25rem; }

.widget-actions { margin-top: 1rem; }
.widget-actions button { margin-right: .5rem; }

/* Basic Bootstrap-like button styling */
.btn { display: inline-block; font-weight: 400; text-align: center; vertical-align: middle; cursor: pointer; user-select: none; background-color: transparent; border: 1px solid transparent; padding: .375rem .75rem; font-size: 1rem; line-height: 1.5; border-radius: .25rem; transition: color .15s ease-in-out,background-color .15s ease-in-out,border-color .15s ease-in-out,box-shadow .15s ease-in-out; }
.btn-primary { color: #fff; background-color: #007bff; border-color: #007bff; }
.btn-primary:hover { background-color: #0056b3; border-color: #0056b3; }
.btn-primary:disabled { background-color: #007bff; border-color: #007bff; opacity: .65; }
.btn-secondary { color: #fff; background-color: #6c757d; border-color: #6c757d; }
.btn-secondary:hover { background-color: #545b62; border-color: #545b62; }
.btn-light { color: #212529; background-color: #f8f9fa; border-color: #f8f9fa; }
.btn-light:hover { background-color: #e2e6ea; border-color: #dae0e5; }
.btn-sm { padding: .25rem .5rem; font-size: .875rem; line-height: 1.5; border-radius: .2rem; }

.loading-indicator, .results-summary, .error-message { margin-top: 1rem; padding: .75rem 1.25rem; border: 1px solid transparent; border-radius: .25rem; }
.alert { /* Base for alert messages */ }
.alert-info { color: #0c5460; background-color: #d1ecf1; border-color: #bee5eb; }
.alert-danger { color: #721c24; background-color: #f8d7da; border-color: #f5c6cb; }
.results-summary ul { list-style: none; padding-left: 0; font-size: 0.9em; margin-top: .5rem; }
.results-summary li { padding: .25rem 0; border-bottom: 1px dashed #eee; }
.results-summary li:last-child { border-bottom: none; }
</style>
