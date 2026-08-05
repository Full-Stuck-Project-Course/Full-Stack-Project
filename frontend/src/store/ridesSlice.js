import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../api/axios";
import { extractItems, extractPagination } from "../api/pagination";

export const fetchRides = createAsyncThunk("rides/fetchRides", async (params = {}) => {
    const { data } = await api.get("/rides", { params });
    return data;
});

export const fetchRideById = createAsyncThunk("rides/fetchRideById", async (id) => {
    const { data } = await api.get(`/rides/${id}`);
    return data;
});

export const createRide = createAsyncThunk("rides/createRide", async (rideData, { rejectWithValue }) => {
    try {
        const { data } = await api.post("/rides", rideData);
        return data;
    } catch (err) {
        return rejectWithValue(err.response?.data?.error || "שגיאה ביצירת נסיעה");
    }
});

export const cancelRide = createAsyncThunk("rides/cancelRide", async ({ rideId, cancelledBy = "passenger" }, { rejectWithValue }) => {
    try {
        const { data } = await api.put(`/rides/${rideId}/cancel`, { cancelledBy });
        return { rideId, ...data };
    } catch (err) {
        return rejectWithValue(err.response?.data?.error || "שגיאה בביטול נסיעה");
    }
});

const ridesSlice = createSlice({
    name: "rides",
    initialState: {
        items: [],
        pagination: null,
        currentRide: null,
        loading: false,
        error: null
    },
    reducers: {
        clearCurrentRide: (state) => { state.currentRide = null; },
        clearError: (state) => { state.error = null; }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchRides.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(fetchRides.fulfilled, (state, action) => {
                state.loading = false;
                state.items = extractItems(action.payload);
                state.pagination = extractPagination(action.payload);
            })
            .addCase(fetchRides.rejected, (state, action) => { state.loading = false; state.error = action.error.message; })
            .addCase(fetchRideById.fulfilled, (state, action) => { state.currentRide = action.payload; })
            .addCase(createRide.pending, (state) => { state.loading = true; state.error = null; })
            .addCase(createRide.fulfilled, (state, action) => { state.loading = false; state.items.unshift(action.payload.ride); })
            .addCase(createRide.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
            .addCase(cancelRide.fulfilled, (state, action) => {
                const idx = state.items.findIndex(r => r._id === action.payload.rideId);
                if (idx !== -1) state.items[idx].status = "cancelled";
            });
    }
});

export const { clearCurrentRide, clearError } = ridesSlice.actions;
export default ridesSlice.reducer;
