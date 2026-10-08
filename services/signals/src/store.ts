// 复用 ingest 的落库，脚手架入口写的是 ./store.js，这里只做转发。
export { load, save } from "../../ingest/src/store.js";
