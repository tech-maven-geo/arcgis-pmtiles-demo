<template>
  <div v-if="visible && processedFeatures && processedFeatures.length > 0" class="attribute-table-container">
    <div class="table-header">
      <h4>Attribute Table: {{ title }} ({{ processedFeatures.length }} features shown)</h4>
      <button @click="$emit('close-table')" class="close-button" title="Close Table">&times;</button>
    </div>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th v-for="field in tableFields" :key="field.name">{{ field.alias || field.name }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(feature, index) in processedFeatures"
              :key="feature.attributes[objectIdField] || index"
              @click="onRowClick(feature)"
              :class="{ 'selected-row': selectedFeature && selectedFeature.attributes[objectIdField] === feature.attributes[objectIdField] }">
            <td v-for="field in tableFields" :key="field.name">
              {{ formatAttribute(feature.attributes[field.name]) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  <div v-else-if="visible" class="attribute-table-container empty-table">
     <div class="table-header">
      <h4>Attribute Table: {{ title }}</h4>
      <button @click="$emit('close-table')" class="close-button" title="Close Table">&times;</button>
    </div>
    <p>No features to display or layer not yet loaded.</p>
  </div>
</template>

<script>
export default {
  name: "AttributeTable",
  props: {
    features: Array,    // Array of ArcGIS Graphic objects
    fields: Array,      // Array of field definition objects { name, alias, type }
    visible: Boolean,
    title: String,
    objectIdField: {    // Field name used as unique row key and for selection tracking
        type: String,
        default: "OBJECTID" // Common default for Esri layers
    }
  },
  emits: ['row-selected', 'close-table'],
  data() {
    return {
      selectedFeatureUid: null, // Store UID of selected feature for styling
    };
  },
  computed: {
    processedFeatures() {
        // Ensure features is an array before trying to use it
        return Array.isArray(this.features) ? this.features : [];
    },
    tableFields() {
      if (!this.fields || this.fields.length === 0) {
        if (this.processedFeatures.length > 0 && this.processedFeatures[0].attributes) {
          return Object.keys(this.processedFeatures[0].attributes)
            .map(attrName => ({ name: attrName, alias: attrName }))
            // Exclude geometry from table if it's somehow in attributes
            .filter(f => f.name.toLowerCase() !== 'geometry' && f.name.toLowerCase() !== 'shape');
        }
        return [];
      }
      // Ensure OBJECTID (or specified id field) is first if it exists, for clarity
      const oidField = this.fields.find(f => f.name === this.objectIdField);
      const otherFields = this.fields.filter(f => f.name !== this.objectIdField);
      return oidField ? [oidField, ...otherFields] : this.fields;
    },
    selectedFeature() {
        if (!this.selectedFeatureUid || !this.processedFeatures) return null;
        return this.processedFeatures.find(f => f.attributes[this.objectIdField] === this.selectedFeatureUid);
    }
  },
  methods: {
    onRowClick(feature) {
      this.selectedFeatureUid = feature.attributes[this.objectIdField];
      this.$emit('row-selected', feature); // Emit the full graphic object
    },
    formatAttribute(value) {
      if (value === null || value === undefined) return "";
      // Basic date detection and formatting (very simple)
      if (value instanceof Date) return value.toLocaleDateString();
      if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
        try { return new Date(value).toLocaleString(); } catch(e) { /* ignore */ }
      }
      if (typeof value === 'number' && !Number.isInteger(value)) {
        return parseFloat(value.toFixed(4)); // Limit decimal places for floats
      }
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    },
    // Method to clear selection if table is hidden or data changes externally
    clearSelection() {
        this.selectedFeatureUid = null;
    }
  },
  watch: {
      visible(newVal) {
          if (!newVal) this.clearSelection(); // Clear selection when table is hidden
      },
      features() {
          this.clearSelection(); // Clear selection when feature set changes
      }
  }
};
</script>

<style scoped>
.attribute-table-container {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  max-height: 35vh;
  background-color: #ffffff;
  border-top: 2px solid #adb5bd; /* Slightly darker border */
  box-shadow: 0 -3px 8px rgba(0,0,0,0.15);
  z-index: 1001;
  display: flex;
  flex-direction: column;
  font-family: Arial, sans-serif;
}
.empty-table p {
    padding: 20px;
    text-align: center;
    color: #6c757d;
}
.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  background-color: #e9ecef; /* Lighter header */
  border-bottom: 1px solid #ced4da;
}
.table-header h4 {
  margin: 0;
  font-size: 1.05em;
  font-weight: 600;
  color: #343a40;
}
.close-button {
  background: none;
  border: none;
  font-size: 1.5em; /* Larger click target */
  font-weight: bold;
  cursor: pointer;
  color: #6c757d;
  padding: 0 5px;
}
.close-button:hover {
    color: #343a40;
}
.table-wrapper {
  overflow: auto;
  flex-grow: 1;
}
table {
  width: 100%;
  min-width: 600px; /* Ensure table has some min width for horizontal scroll */
  border-collapse: collapse;
  font-size: 0.85em; /* Slightly smaller font for more data */
}
th, td {
  border: 1px solid #dee2e6;
  padding: 7px 10px;
  text-align: left;
  white-space: nowrap;
  max-width: 250px; /* Max width for a cell */
  overflow: hidden;
  text-overflow: ellipsis; /* Add ellipsis for overflowed content */
}
th {
  background-color: #f8f9fa;
  position: sticky;
  top: 0;
  z-index: 1; /* ensure th is above td during scroll */
  font-weight: 600;
  color: #495057;
}
tbody tr:hover {
  background-color: #e9ecef;
  cursor: pointer;
}
.selected-row {
  background-color: #cfe2ff !important; /* Bootstrap's primary light blue */
  color: #004085; /* Darker text for selected row for contrast */
}
.selected-row td {
    font-weight: 500; /* Slightly bolder */
}
</style>
