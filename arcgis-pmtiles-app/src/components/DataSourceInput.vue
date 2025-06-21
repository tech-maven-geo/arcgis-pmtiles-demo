<template>
  <div class="data-source-input-container">
    <button @click="toggleForm" class="toggle-button">
      {{ showForm ? 'Hide Layer Input' : 'Add Layer from URL' }}
    </button>
    <div v-if="showForm" class="input-form">
      <h3>Add Data Source</h3>

      <div class="form-group">
        <label for="dataSourceType">Data Type:</label>
        <select id="dataSourceType" v-model="selectedType" @change="handleTypeChange">
          <option disabled value="">Please select a type</option>
          <option v-for="typeObj in dataTypes" :key="typeObj.id" :value="typeObj.id">
            {{ typeObj.label }}
          </option>
        </select>
      </div>

      <!-- Generic URL input (not for OGC, Mapzen, or COPC) -->
      <div v-if="selectedType && selectedType !== 'ogc-api-features' && selectedType !== 'mapzen-terrarium-png' && selectedType !== 'copc'" class="form-group">
        <label for="dataSourceUrl">Data URL:</label>
        <input type="text" id="dataSourceUrl" v-model.trim="url" placeholder="Enter URL for selected data type" />
      </div>

      <!-- OGC API Features Specific Inputs -->
      <div v-if="selectedType === 'ogc-api-features'">
        <div class="form-group">
          <label for="ogcServiceUrl">OGC API Service URL (base path):</label>
          <input type="text" id="ogcServiceUrl" v-model.trim="ogcServiceUrl" placeholder="e.g., https://demo.pygeoapi.io/master/" />
        </div>
        <div class="form-group">
          <label for="ogcCollectionId">Collection ID:</label>
          <input type="text" id="ogcCollectionId" v-model.trim="ogcCollectionId" placeholder="e.g., obs, lakes" />
        </div>
        <div class="form-group">
          <label for="ogcAuthType">Authentication Type:</label>
          <select id="ogcAuthType" v-model="ogcAuthType">
            <option value="none">None</option>
            <option value="token">Bearer Token / API Key</option>
            <option value="basic">Basic Auth (Username/Password)</option>
          </select>
        </div>
        <div v-if="ogcAuthType === 'token'" class="form-group">
          <label for="ogcToken">Token / API Key:</label>
          <input type="password" id="ogcToken" v-model.trim="ogcToken" placeholder="Enter token or API key" />
        </div>
        <div v-if="ogcAuthType === 'basic'">
          <div class="form-group">
            <label for="ogcUsername">Username:</label>
            <input type="text" id="ogcUsername" v-model.trim="ogcUsername" placeholder="Enter username" />
          </div>
          <div class="form-group">
            <label for="ogcPassword">Password:</label>
            <input type="password" id="ogcPassword" v-model.trim="ogcPassword" placeholder="Enter password" />
          </div>
        </div>
      </div>

      <!-- Mapzen Terrarium URL input -->
      <div v-if="selectedType === 'mapzen-terrarium-png'" class="form-group">
        <label for="mapzenUrlTemplate">Mapzen Terrarium URL Template:</label>
        <input type="text" id="mapzenUrlTemplate" v-model.trim="mapzenUrlTemplate" placeholder="e.g., https://.../{level}/{col}/{row}.png" />
         <small>Use {level}, {col}, {row}. Add {apiKey} if needed for apiKey property.</small>
         <label for="mapzenApiKey" style="margin-top: 5px;">API Key (optional, if template uses {apiKey}):</label>
         <input type="password" id="mapzenApiKey" v-model.trim="mapzenApiKey" placeholder="Enter API Key if required" />
      </div>

      <!-- COPC URL input -->
      <div v-if="selectedType === 'copc'" class="form-group">
        <label for="copcUrl">COPC File URL (.copc.laz):</label>
        <input type="text" id="copcUrl" v-model.trim="copcUrl" placeholder="Enter URL to .copc.laz file" />
      </div>

      <button @click="handleAddLayer" class="add-button" :disabled="!isInputValid">
        Add Layer
      </button>
    </div>
  </div>
</template>

<script>
export default {
  name: "DataSourceInput",
  emits: ['add-layer'],
  data() {
    return {
      showForm: true,
      url: "",
      selectedType: "",
      // OGC API Fields
      ogcServiceUrl: "",
      ogcCollectionId: "",
      ogcAuthType: "none",
      ogcToken: "",
      ogcUsername: "",
      ogcPassword: "",
      // Mapzen Fields
      mapzenUrlTemplate: "",
      mapzenApiKey: "",
      // COPC Fields
      copcUrl: "", // e.g. "https://s3.amazonaws.com/data.entwine.io/millsite.copc.laz"
      dataTypes: [
        { id: "pmtiles-raster", label: "PMTiles - Raster" },
        { id: "pmtiles-vector", label: "PMTiles - Vector" },
        { id: "pmtiles-terrain", label: "PMTiles - Terrain (LERC2)" },
        { id: "flatgeobuf", label: "FlatGeobuf" },
        { id: "cog", label: "Cloud Optimized GeoTIFF" },
        { id: "ogc-api-features", label: "OGC API - Features" },
        { id: "mapzen-terrarium-png", label: "Mapzen Terrarium (Terrain PNG)" },
        { id: "copc", label: "COPC (Point Cloud)" }, // New type
      ],
    };
  },
  computed: {
    isInputValid() {
      if (!this.selectedType) return false;
      if (this.selectedType === 'ogc-api-features') {
        if (!this.ogcServiceUrl || !this.ogcCollectionId) return false;
        if (this.ogcAuthType === 'token' && !this.ogcToken) return false;
        if (this.ogcAuthType === 'basic' && (!this.ogcUsername || !this.ogcPassword)) return false;
        return true;
      }
      if (this.selectedType === 'mapzen-terrarium-png') {
        return !!this.mapzenUrlTemplate;
      }
      if (this.selectedType === 'copc') {
        return !!this.copcUrl;
      }
      return !!this.url; // For other types that use the generic 'url' field
    }
  },
  methods: {
    toggleForm() {
      this.showForm = !this.showForm;
    },
    handleTypeChange() {
      // Clear all specific fields when type changes
      this.url = "";
      this.ogcServiceUrl = "";
      this.ogcCollectionId = "";
      this.ogcAuthType = "none";
      this.ogcToken = "";
      this.ogcUsername = "";
      this.ogcPassword = "";
      this.mapzenUrlTemplate = "";
      this.mapzenApiKey = "";
      this.copcUrl = "";
    },
    handleAddLayer() {
      if (!this.isInputValid) {
        alert("Please fill in all required fields for the selected data type.");
        return;
      }

      let payload = { type: this.selectedType };
      if (this.selectedType === 'ogc-api-features') {
        payload.serviceUrl = this.ogcServiceUrl;
        payload.collectionId = this.ogcCollectionId;
        payload.auth = { type: this.ogcAuthType, token: this.ogcToken, username: this.ogcUsername, password: this.ogcPassword };
      } else if (this.selectedType === 'mapzen-terrarium-png') {
        payload.urlTemplate = this.mapzenUrlTemplate;
        payload.apiKey = this.mapzenApiKey;
      } else if (this.selectedType === 'copc') {
        payload.url = this.copcUrl; // COPC uses a direct URL to the .copc.laz file
      } else { // For PMTiles, FlatGeobuf, COG
        payload.url = this.url;
      }

      this.$emit('add-layer', payload);
    },
  },
};
</script>

<style scoped>
/* Styles are largely the same, ensure they accommodate the new fields well */
.data-source-input-container {
  position: absolute; top: 10px; left: 10px; z-index: 1000;
  background-color: white; padding: 10px; border-radius: 5px;
  box-shadow: 0 2px 5px rgba(0,0,0,0.2); font-family: Arial, sans-serif;
  max-width: 420px; max-height: calc(100vh - 20px); overflow-y: auto;
}
.toggle-button { margin-bottom: 10px; background-color: #007bff; color:white; border:none; padding: 8px 12px; border-radius:4px; cursor:pointer; width:100%; box-sizing: border-box;}
.toggle-button:hover { background-color: #0056b3; }
.input-form { border: 1px solid #ccc; padding: 15px; border-radius: 4px; background-color: #f9f9f9; }
.input-form h3 { margin-top: 0; margin-bottom: 15px; font-size: 1.1em; }
.form-group { margin-bottom: 12px; }
.form-group label { display: block; margin-bottom: 5px; font-weight: bold; font-size: 0.9em; }
.form-group input[type="text"], .form-group input[type="password"], .form-group select { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; font-size: 0.9em; }
.form-group small { font-size: 0.8em; color: #555; display:block; margin-top:3px; }
.add-button { background-color: #28a745; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer; width: 100%; box-sizing: border-box; font-size: 1em; }
.add-button:hover:not(:disabled) { background-color: #1e7e34; }
.add-button:disabled { background-color: #aabbcc; color: #666; cursor: not-allowed; }
</style>
