import { Search, Loader2 } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";

interface InputProps {
    onAnalyze: (url: string) => void;
    loading: boolean;
}

export function Input({ onAnalyze, loading }: InputProps) {
    const [url, setUrl] = useState("");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (url && !loading) {
            let formattedUrl = url;
            if (!url.startsWith("http")) {
                formattedUrl = "https://" + url;
            }
            onAnalyze(formattedUrl);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="w-full max-w-2xl"
        >
            <div className="relative group">
                {/* Glow effect behind the input */}
                <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-violet-500/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-2 flex items-center gap-2 shadow-2xl shadow-black/20">
                    <Search className="w-5 h-5 text-gray-500 ml-4 shrink-0" />
                    <form onSubmit={handleSubmit} className="flex-1">
                        <input
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="Paste any URL (e.g. stripe.com)"
                            className="w-full bg-transparent border-none outline-none text-white text-lg px-3 py-3 placeholder:text-gray-600 font-medium"
                            disabled={loading}
                        />
                    </form>
                    <button
                        onClick={handleSubmit as any}
                        disabled={loading || !url}
                        className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white px-7 py-3 rounded-xl font-bold text-base transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2 shadow-lg shadow-cyan-500/20"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="animate-spin w-5 h-5" />
                                <span>Analyzing</span>
                            </>
                        ) : "Analyze"}
                    </button>
                </div>
            </div>
        </motion.div>
    );
}
