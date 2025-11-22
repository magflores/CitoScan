import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { getToken } from "../features/auth/api";

export const isAuthed = () => !!getToken();

export function RequireAuth() {
    const loc = useLocation();
    return isAuthed() ? <Outlet /> : <Navigate to="/login" replace state={{ from: loc }} />;
}

export function PublicOnly() {
    return isAuthed() ? <Navigate to="/home" replace /> : <Outlet />;
}

export function RootRoute({ landing }) {
    return isAuthed() ? <Navigate to="/home" replace /> : landing;
}
