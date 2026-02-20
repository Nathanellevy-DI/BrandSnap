import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sparkles, AlertCircle } from "lucide-react";
import { Input } from "./components/Input";
import { Results } from "./components/Results";
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

interface AnalysisData {
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

function App() {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async (url: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<AnalysisData>("analyze_page", { url });
      setData(result);
    } catch (err) {
      console.error(err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setData(null);
    setError(null);
  };

  return (
    <div className="w-full min-h-screen relative overflow-hidden">
      {/* Ambient Background Orbs */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[10%] w-[600px] h-[600px] bg-cyan-500/8 rounded-full blur-[150px]" />
        <div className="absolute top-[30%] right-[-5%] w-[500px] h-[500px] bg-violet-500/8 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-15%] left-[40%] w-[700px] h-[700px] bg-blue-500/6 rounded-full blur-[180px]" />
      </div>

      {/* Subtle Grid Pattern */}
      <div
        className="fixed inset-0 z-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />

      {/* Main Content */}
      <div className="relative z-10 w-full min-h-screen flex flex-col">

        {/* Top Bar */}
        <nav className="w-full px-8 py-4 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-white tracking-tight">BrandSnap</span>
          </div>
          <div className="text-sm text-gray-500">Brand Extraction Tool</div>
        </nav>

        {/* Page Body */}
        <div className="flex-1 w-full flex flex-col">
          <AnimatePresence mode="wait">
            {!data ? (
              <motion.div
                key="input-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="flex-1 w-full flex flex-col items-center justify-center px-8 py-16"
              >
                {/* Hero */}
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="text-center mb-12 max-w-3xl"
                >
                  <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-sm font-medium text-cyan-400">
                    <Sparkles className="w-4 h-4" />
                    <span>AI-Powered Brand Extraction</span>
                  </div>
                  <h1 className="text-7xl md:text-8xl font-black tracking-tight mb-6">
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-100 to-cyan-200">
                      Brand
                    </span>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-400">
                      Snap
                    </span>
                  </h1>
                  <p className="text-xl md:text-2xl text-gray-400 font-light leading-relaxed">
                    Extract fonts, colors, and metadata from any website in seconds.
                  </p>
                </motion.div>

                {/* Error */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-2xl mb-6 bg-red-500/10 border border-red-500/20 text-red-300 px-5 py-4 rounded-xl flex items-center gap-3"
                  >
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p className="text-sm">{error}</p>
                  </motion.div>
                )}

                {/* Input */}
                <Input onAnalyze={handleAnalyze} loading={loading} />

                {/* Feature Pills */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="flex flex-wrap justify-center gap-3 mt-10"
                >
                  {["Color Palettes", "Font Detection", "Images", "Text Content", "JSON Export"].map((feature) => (
                    <span key={feature} className="px-4 py-2 text-sm text-gray-500 bg-white/3 border border-white/5 rounded-full">
                      {feature}
                    </span>
                  ))}
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                key="results-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="flex-1 w-full"
              >
                {error && (
                  <div className="w-full px-8 pt-4">
                    <div className="bg-red-500/10 border border-red-500/20 text-red-300 px-5 py-4 rounded-xl flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <p className="text-sm">{error}</p>
                    </div>
                  </div>
                )}
                <Results data={data} onReset={handleReset} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <footer className="w-full px-8 py-4 border-t border-white/5 text-center">
          <p className="text-gray-600 text-sm">&copy; {new Date().getFullYear()} BrandSnap &mdash; Built with Tauri &amp; React</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
