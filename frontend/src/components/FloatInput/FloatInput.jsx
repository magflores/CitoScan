import React from "react";
import "./FloatInput.css";

export default function FloatInput({id, label, type = "text", value, onChange, onBlur, autoComplete, disabled, className}) {
    return (
        <label className={`fi ${className || ""}`} htmlFor={id}>
            <input
                id={id}
                className="fi__input"
                type={type}
                value={value}
                onChange={onChange}
                onBlur={onBlur}
                placeholder=" "
                autoComplete={autoComplete}
                disabled={disabled}
                required={!disabled}
            />
            <span className="fi__label">{label}</span>
        </label>
    );
}