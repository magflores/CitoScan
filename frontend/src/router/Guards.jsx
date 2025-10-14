import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

const isAuthed = () => !!localStorage.getItem("auth_token");

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
