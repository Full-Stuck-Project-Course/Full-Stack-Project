import { configureStore } from "@reduxjs/toolkit";
import ridesReducer from "./ridesSlice";

const store = configureStore({
    reducer: {
        rides: ridesReducer
    }
});

export default store;
