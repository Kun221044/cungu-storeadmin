// In-memory stand-in for @netlify/blobs, for local tests only
const stores=new Map();let n=0;
export function getStore({name}){if(!stores.has(name))stores.set(name,new Map());const m=stores.get(name);
 const tag=()=>'e'+(++n);
 return {
  async getMetadata(k){const v=m.get(k);return v?{etag:v.etag,metadata:v.meta}:null;},
  async getWithMetadata(k,{type}={}){const v=m.get(k);if(!v)return null;return {data:type==='json'?JSON.parse(v.data):v.data,etag:v.etag,metadata:v.meta};},
  async get(k,{type}={}){const v=m.get(k);if(!v)return null;return type==='json'?JSON.parse(v.data):v.data;},
  async setJSON(k,d,o={}){return this.set(k,JSON.stringify(d),o);},
  async set(k,d,o={}){const v=m.get(k);if(o.onlyIfNew&&v)return {modified:false};if(o.onlyIfMatch&&(!v||v.etag!==o.onlyIfMatch))return {modified:false};const e=tag();m.set(k,{data:d,etag:e,meta:o.metadata||{}});return {modified:true,etag:e};},
  async delete(k){m.delete(k);},
  async list({prefix=''}={}){return {blobs:[...m.keys()].filter(k=>k.startsWith(prefix)).map(k=>({key:k,etag:m.get(k).etag}))};},
 };}
