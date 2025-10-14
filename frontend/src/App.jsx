import React from "react";
import {Routes, Route} from "react-router-dom";
import Landing from "./pages/Landing/Landing.jsx";
import Login from "./pages/Auth/Login/Login.jsx";
import NotFound from "./pages/NotFound/NotFound.jsx";
import Register from "./pages/Auth/Register/Register.jsx";
import Home from "./pages/Home/Home.jsx";
import {RequireAuth, PublicOnly, RootRoute, isAuthed} from "./router/guards.jsx";

export default function App() {
    return (
        <Routes>
            <Route path="/" element={<RootRoute landing={<Landing/>}/>}/>

            <Route element={<PublicOnly/>}>
                <Route path="/login" element={<Login/>}/>
                <Route path="/register" element={<Register/>}/>
            </Route>

            <Route element={<RequireAuth/>}>
                <Route path="/home" element={<Home/>}/>
            </Route>

            <Route
                path="/info"
                element={<Landing headerMode={isAuthed() ? "auth" : "public"} />}
            />

            <Route path="*" element={<NotFound/>}/>
        </Routes>
    );
}
