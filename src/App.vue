<template>
  <div id="app">
    <MapView />
  </div>
</template>

<script>
import MapView from "./components/MapView.vue";

export default {
  name: "App",
  components: {
    MapView,
  },
};
</script>

<style>
/* Global styles if any */
html,
body,
#app {
  padding: 0;
  margin: 0;
  height: 100%;
  width: 100%;
}
</style>
