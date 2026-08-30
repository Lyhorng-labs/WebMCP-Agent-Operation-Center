"use client";
import {useEffect} from "react";
import { registerWebMCPTools } from "./tools";

export default function WebMCPProvider() {
    useEffect(() => {
        registerWebMCPTools();
    }, []);

    return null;
}