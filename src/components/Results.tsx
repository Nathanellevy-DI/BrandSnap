import { Copy, Type, ArrowLeft, Download, Palette, Globe } from "lucide-react";
import { motion } from "framer-motion";

interface AnalysisResult {
    colors: string[];
    fonts: string[];
    metadata: {
        title: string;
        description: string;
        favicon: string;
    };
}

interface ResultsProps {
    data: AnalysisResult;
    onReset: () => void;
}

export function Results({ data, onReset }: ResultsProps) {
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    const handleExport = () => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `brandsnap-${data.metadata.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="w-full h-full flex flex-col">
            {/* Results Header Bar */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full px-8 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]"
            >
                <div className="flex items-center gap-5">
                    <button
                        onClick={onReset}
                        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors px-4 py-2 rounded-xl hover:bg-white/5"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span className="text-sm font-medium">New Analysis</span>
                    </button>
                    <div className="h-6 w-px bg-white/10" />
                    <div className="flex items-center gap-3">
                        {data.metadata.favicon && (
                            <img src={data.metadata.favicon} alt="" className="w-6 h-6 rounded" />
                        )}
                        <span className="text-white font-semibold text-lg truncate max-w-md">{data.metadata.title}</span>
                    </div>
                </div>
                <button
                    onClick={handleExport}
                    className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-all hover:scale-[1.02] shadow-lg shadow-cyan-500/20"
                >
                    <Download className="w-4 h-4" />
                    Export Brand Sheet
                </button>
            </motion.div>

            {/* Results Grid - This is the main content that fills the screen */}
            <div className="flex-1 w-full grid grid-cols-1 lg:grid-cols-3 gap-0 overflow-auto">

                {/* LEFT COLUMN: Metadata + Colors */}
                <div className="lg:col-span-2 flex flex-col border-r border-white/5">

                    {/* Metadata Section */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        className="p-8 border-b border-white/5"
                    >
                        <div className="flex items-center gap-3 mb-5">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                <Globe className="w-5 h-5 text-emerald-400" />
                            </div>
                            <h2 className="text-xl font-bold text-white">Site Metadata</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 font-semibold">Title</p>
                                <p className="text-white font-medium text-lg leading-snug">{data.metadata.title || "—"}</p>
                            </div>
                            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 font-semibold">Description</p>
                                <p className="text-gray-300 text-sm leading-relaxed">{data.metadata.description || "No description found."}</p>
                            </div>
                        </div>
                    </motion.div>

                    {/* Color Palette Section */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="flex-1 p-8"
                    >
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center">
                                    <Palette className="w-5 h-5 text-pink-400" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white">Color Palette</h2>
                                    <p className="text-sm text-gray-500">{data.colors.length} colors extracted</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                            {data.colors.map((color, i) => (
                                <motion.button
                                    key={i}
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 0.05 * i }}
                                    whileHover={{ scale: 1.05, y: -3 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => copyToClipboard(color)}
                                    className="group flex flex-col items-center gap-2"
                                >
                                    <div
                                        className="w-full aspect-square rounded-xl shadow-lg ring-1 ring-white/10 hover:ring-white/30 transition-all relative overflow-hidden"
                                        style={{ backgroundColor: color }}
                                    >
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/30 backdrop-blur-sm transition-all duration-200">
                                            <Copy className="w-5 h-5 text-white drop-shadow-lg" />
                                        </div>
                                    </div>
                                    <span className="text-[11px] font-mono text-gray-500 group-hover:text-gray-300 transition-colors truncate w-full text-center">
                                        {color}
                                    </span>
                                </motion.button>
                            ))}
                        </div>

                        {data.colors.length === 0 && (
                            <div className="text-center py-16 text-gray-600">No colors detected.</div>
                        )}
                    </motion.div>
                </div>

                {/* RIGHT COLUMN: Typography */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="flex flex-col bg-white/[0.01]"
                >
                    <div className="p-8 border-b border-white/5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                <Type className="w-5 h-5 text-blue-400" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">Typography</h2>
                                <p className="text-sm text-gray-500">{data.fonts.length} font families</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto p-6 space-y-3">
                        {data.fonts.map((font, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.05 * i }}
                                className="group relative bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-white/10 rounded-xl p-5 transition-all duration-200 cursor-pointer"
                                onClick={() => copyToClipboard(font)}
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <span
                                        className="text-3xl text-white/90"
                                        style={{ fontFamily: `${font}, sans-serif` }}
                                    >
                                        Aa
                                    </span>
                                    <Copy className="w-4 h-4 text-gray-600 group-hover:text-gray-300 transition-colors" />
                                </div>
                                <p className="text-sm font-mono text-cyan-400/80 truncate">{font}</p>
                                <p
                                    className="text-xs text-gray-600 mt-2 leading-relaxed"
                                    style={{ fontFamily: `${font}, sans-serif` }}
                                >
                                    The quick brown fox jumps over the lazy dog.
                                </p>
                            </motion.div>
                        ))}
                        {data.fonts.length === 0 && (
                            <div className="text-center py-16 text-gray-600">No fonts detected.</div>
                        )}
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
