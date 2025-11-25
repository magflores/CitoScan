import React from "react";
import "./FloatInput.css";

export default function FloatInput({id, label, type = "text", value, onChange, onBlur, autoComplete}) {
    return (
        <label className="fi" htmlFor={id}>
            <input
                id={id}
                className="fi__input"
                type={type}
                value={value}
                onChange={onChange}
                onBlur={onBlur}
                placeholder=" "
                autoComplete={autoComplete}
                required
            />
            <span className="fi__label">{label}</span>
        </label>
    );
}