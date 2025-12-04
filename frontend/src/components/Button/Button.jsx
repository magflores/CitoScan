import React from "react";
import { Link } from "react-router-dom";
import "./Button.css";

export default function Button({ to, variant = "outline", tone, className = "", children, ...rest }) {
    const base = "btn";
    const variantClass = variant === "muted" ? "btn-muted"
        : variant === "primary" ? "btn-primary"
            : "btn-outline";
    const cls = `${base} ${variantClass} ${className}`.trim();

    let tintRGB;
    if (tone === "pink") tintRGB = "225,178,206";
    else if (tone === "blue") tintRGB = "183,215,222";
    else if (typeof tone === "string" && /^(\d{1,3},){2}\d{1,3}$/.test(tone)) tintRGB = tone;

    const style = tintRGB ? { "--btn-tint-rgb": tintRGB } : undefined;

    if (to) {
        const isInternal = !/^https?:/i.test(to);
        if (isInternal) {
            return <Link to={to} className={cls} style={style} {...rest}>{children}</Link>;
        }
        return <a href={to} className={cls} style={style} {...rest}>{children}</a>;
    }

    return <button className={cls} style={style} {...rest}>{children}</button>;
}