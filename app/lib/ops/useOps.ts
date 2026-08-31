"use client";
import { useSyncExternalStore } from "react";
import { getSnapshot, subscribe } from "./store";

export function useOps(){
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}