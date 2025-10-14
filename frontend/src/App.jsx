import React from "react";
import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing/Landing.jsx";
import Login from "./pages/Auth/Login/Login.jsx";
import NotFound from "./pages/NotFound/NotFound.jsx";
import Register from "./pages/Auth/Register/Register.jsx";
import Home from "./pages/Home/Home.jsx";


export default function App() {
    return (
        <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/home" element={<Home />} />
            <Route path="/info" element={<Landing headerMode="auth" />} />
            <Route path="*" element={<NotFound />} />
        </Routes>
    );
}