// leaflet.markercluster ships no ESM types and exports nothing at runtime —
// it attaches L.MarkerClusterGroup / L.markerClusterGroup onto the shared
// leaflet `L` object (leaflet sets window.L, so the plugin's factory finds
// it). Typed members come from @types/leaflet.markercluster, which augments
// the "leaflet" module. This ambient declaration lets the client component
// `await import('leaflet.markercluster')` for its side effect.
declare module 'leaflet.markercluster';
