import React from "react";
import "./FloatInput.css";

export default function FloatInput({ id, label, type = "text", value, onChange, autoComplete }) {
    return (
        <label className="fi" htmlFor={id}>
            <input
                id={id}
                className="fi__input"
                type={type}
                value={value}
                onChange={onChange}
                placeholder=" "
                autoComplete={autoComplete}
                required
            />
            <span className="fi__label">{label}</span>
        </label>
    );
}