import { useState } from "react";
import { Copy, Type, ArrowLeft, Download, Palette, Globe, Image, FileText, Check, ExternalLink, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ImageInfo {
    src: string;
    alt: string;
    width: number;
    height: number;
}

interface TextBlock {
    tag: string;
    text: string;
}

interface AnalysisResult {
    colors: string[];
    fonts: string[];
    images: ImageInfo[];
    text_content: TextBlock[];
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

type TabId = "brand" | "images" | "text";

export function Results({ data, onReset }: ResultsProps) {
    const [activeTab, setActiveTab] = useState<TabId>("brand");
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [textFilter, setTextFilter] = useState("");
    const [imageFilter, setImageFilter] = useState<"all" | "large" | "medium" | "small">("all");

    const copyToClipboard = (text: string, id?: string) => {
        navigator.clipboard.writeText(text);
        if (id) {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 1500);
        }
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

    const tabs = [
        { id: "brand" as TabId, label: "Brand", icon: Palette, count: data.colors.length + data.fonts.length },
        { id: "images" as TabId, label: "Images", icon: Image, count: data.images?.length || 0 },
        { id: "text" as TabId, label: "Text", icon: FileText, count: data.text_content?.length || 0 },
    ];

    const filteredImages = (data.images || []).filter(img => {
        if (imageFilter === "all") return true;
        const area = img.width * img.height;
        if (imageFilter === "large") return area > 100000;
        if (imageFilter === "medium") return area > 10000 && area <= 100000;
        return area <= 10000 || area === 0;
    });

    const filteredText = (data.text_content || []).filter(block =>
        textFilter === "" || block.text.toLowerCase().includes(textFilter.toLowerCase()) || block.tag.toLowerCase().includes(textFilter.toLowerCase())
    );

    // Group text by tag
    const textByTag: Record<string, TextBlock[]> = {};
    filteredText.forEach(block => {
        if (!textByTag[block.tag]) textByTag[block.tag] = [];
        textByTag[block.tag].push(block);
    });

    const tagOrder = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'LI', 'BLOCKQUOTE', 'FIGCAPTION', 'A', 'SPAN', 'BUTTON', 'LABEL', 'TD', 'TH'];

    return (
        <div className="w-full h-full flex flex-col">
            {/* Results Header Bar */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full px-8 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]"
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

            {/* Tab Navigation */}
            <div className="w-full px-8 py-0 border-b border-white/5 bg-white/[0.01] flex items-center gap-1">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2.5 px-5 py-3.5 text-sm font-medium transition-all relative
                            ${activeTab === tab.id
                                ? 'text-cyan-400'
                                : 'text-gray-500 hover:text-gray-300'
                            }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        <span>{tab.label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-cyan-500/15 text-cyan-400' : 'bg-white/5 text-gray-600'}`}>
                            {tab.count}
                        </span>
                        {activeTab === tab.id && (
                            <motion.div
                                layoutId="activeTab"
                                className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-400 to-blue-500"
                            />
                        )}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 w-full overflow-auto">
                <AnimatePresence mode="wait">
                    {activeTab === "brand" && (
                        <motion.div
                            key="brand"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="w-full h-full"
                        >
                            <BrandTab data={data} copyToClipboard={copyToClipboard} copiedId={copiedId} />
                        </motion.div>
                    )}

                    {activeTab === "images" && (
                        <motion.div
                            key="images"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="w-full h-full"
                        >
                            <div className="p-8">
                                {/* Image Filters */}
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                                            <Image className="w-5 h-5 text-violet-400" />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-white">Images</h2>
                                            <p className="text-sm text-gray-500">{filteredImages.length} images found</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        {(["all", "large", "medium", "small"] as const).map(f => (
                                            <button
                                                key={f}
                                                onClick={() => setImageFilter(f)}
                                                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all capitalize
                                                    ${imageFilter === f
                                                        ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                                                        : 'bg-white/5 text-gray-500 border border-white/5 hover:border-white/10 hover:text-gray-300'
                                                    }`}
                                            >
                                                {f}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Image Grid */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                    {filteredImages.map((img, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: 0.03 * i }}
                                            className="group relative bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden hover:border-white/15 transition-all"
                                        >
                                            <div className="aspect-square relative">
                                                <img
                                                    src={img.src}
                                                    alt={img.alt}
                                                    className="w-full h-full object-cover"
                                                    loading="lazy"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                    }}
                                                />
                                                {/* Hover overlay */}
                                                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-200 flex flex-col items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => copyToClipboard(img.src, `img-${i}`)}
                                                        className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-xs px-3 py-1.5 rounded-lg transition-all"
                                                    >
                                                        {copiedId === `img-${i}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                        {copiedId === `img-${i}` ? 'Copied!' : 'Copy URL'}
                                                    </button>
                                                    <a
                                                        href={img.src}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-xs px-3 py-1.5 rounded-lg transition-all"
                                                    >
                                                        <ExternalLink className="w-3 h-3" />
                                                        Open
                                                    </a>
                                                </div>
                                            </div>
                                            <div className="p-2.5">
                                                <p className="text-[10px] font-mono text-gray-500 truncate">{img.alt || new URL(img.src).pathname.split('/').pop() || 'image'}</p>
                                                {img.width > 0 && (
                                                    <p className="text-[10px] text-gray-600 mt-0.5">{img.width}×{img.height}</p>
                                                )}
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>

                                {filteredImages.length === 0 && (
                                    <div className="text-center py-20 text-gray-600">
                                        <Image className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                        <p>No images found{imageFilter !== "all" ? ` matching "${imageFilter}" filter` : ""}.</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {activeTab === "text" && (
                        <motion.div
                            key="text"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="w-full h-full"
                        >
                            <div className="p-8">
                                {/* Text Header */}
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                            <FileText className="w-5 h-5 text-amber-400" />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-white">Text Content</h2>
                                            <p className="text-sm text-gray-500">{filteredText.length} text blocks extracted</p>
                                        </div>
                                    </div>
                                    <div className="relative">
                                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                        <input
                                            type="text"
                                            placeholder="Filter text..."
                                            value={textFilter}
                                            onChange={e => setTextFilter(e.target.value)}
                                            className="pl-9 pr-4 py-2 text-sm bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 w-64"
                                        />
                                    </div>
                                </div>

                                {/* Text Groups */}
                                <div className="space-y-8">
                                    {tagOrder.filter(tag => textByTag[tag]?.length > 0).map(tag => (
                                        <div key={tag}>
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold uppercase tracking-wider text-cyan-400/70 bg-cyan-500/10 px-2.5 py-1 rounded-md">{tag}</span>
                                                    <span className="text-xs text-gray-600">{textByTag[tag].length} items</span>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const all = textByTag[tag].map(b => b.text).join('\n\n');
                                                        copyToClipboard(all, `group-${tag}`);
                                                    }}
                                                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
                                                >
                                                    {copiedId === `group-${tag}` ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                                    {copiedId === `group-${tag}` ? 'Copied!' : 'Copy All'}
                                                </button>
                                            </div>
                                            <div className="space-y-2">
                                                {textByTag[tag].map((block, i) => (
                                                    <motion.div
                                                        key={i}
                                                        initial={{ opacity: 0, x: -10 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ delay: 0.02 * i }}
                                                        className="group flex items-start gap-3 bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 hover:border-white/10 rounded-xl p-4 transition-all cursor-pointer"
                                                        onClick={() => copyToClipboard(block.text, `text-${tag}-${i}`)}
                                                    >
                                                        <p className="flex-1 text-sm text-gray-300 leading-relaxed">{block.text}</p>
                                                        <div className="shrink-0 mt-0.5">
                                                            {copiedId === `text-${tag}-${i}` ? (
                                                                <Check className="w-4 h-4 text-green-400" />
                                                            ) : (
                                                                <Copy className="w-4 h-4 text-gray-600 group-hover:text-gray-300 transition-colors" />
                                                            )}
                                                        </div>
                                                    </motion.div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {filteredText.length === 0 && (
                                    <div className="text-center py-20 text-gray-600">
                                        <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                        <p>No text content found{textFilter ? ` matching "${textFilter}"` : ""}.</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

/* ── Brand Tab (preserved from original layout) ── */
function BrandTab({ data, copyToClipboard, copiedId }: { data: ResultsProps["data"]; copyToClipboard: (text: string, id?: string) => void; copiedId: string | null }) {
    return (
        <div className="w-full h-full grid grid-cols-1 lg:grid-cols-3 gap-0">
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
                                onClick={() => copyToClipboard(color, `color-${i}`)}
                                className="group flex flex-col items-center gap-2"
                            >
                                <div
                                    className="w-full aspect-square rounded-xl shadow-lg ring-1 ring-white/10 hover:ring-white/30 transition-all relative overflow-hidden"
                                    style={{ backgroundColor: color }}
                                >
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/30 backdrop-blur-sm transition-all duration-200">
                                        {copiedId === `color-${i}` ? (
                                            <Check className="w-5 h-5 text-green-400 drop-shadow-lg" />
                                        ) : (
                                            <Copy className="w-5 h-5 text-white drop-shadow-lg" />
                                        )}
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
                            onClick={() => copyToClipboard(font, `font-${i}`)}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <span
                                    className="text-3xl text-white/90"
                                    style={{ fontFamily: `${font}, sans-serif` }}
                                >
                                    Aa
                                </span>
                                {copiedId === `font-${i}` ? (
                                    <Check className="w-4 h-4 text-green-400" />
                                ) : (
                                    <Copy className="w-4 h-4 text-gray-600 group-hover:text-gray-300 transition-colors" />
                                )}
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
    );
}
