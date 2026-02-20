import { motion } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { ReactNode } from "react";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface GlassPanelProps {
    children: ReactNode;
    className?: string;
    delay?: number;
}

export function GlassPanel({ children, className, delay = 0 }: GlassPanelProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay, ease: "easeOut" }}
            className={cn(
                "bg-white/10 backdrop-blur-xl border border-white/20 shadow-xl rounded-2xl overflow-hidden",
                className
            )}
        >
            {children}
        </motion.div>
    );
}
