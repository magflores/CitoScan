import React from "react";
import "./Button.css";

export default function Button({ variant = "outline", to, as, className = "", children, ...rest }) {
    const base = "btn";
    const variantClass = variant === "muted" ? "btn-muted" : variant === "primary" ? "btn-primary" : "btn-outline";
    const cls = `${base} ${variantClass} ${className}`.trim();


    if (as === "button" && !to) {
        return (
            <button className={cls} {...rest}>
                {children}
            </button>
        );
    }
    return (
        <a href={to || "#"} className={cls} {...rest}>
            {children}
        </a>
    );
}