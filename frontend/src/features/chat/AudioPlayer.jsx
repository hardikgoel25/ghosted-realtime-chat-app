import { useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { formatDuration } from "../../lib/utils";

const RATES = [1, 1.5, 2];

export default function AudioPlayer({ src, durationMs, mine }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(durationMs ? durationMs / 1000 : 0);
  const [rate, setRate] = useState(1);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.playbackRate = rate;
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  };

  const cycleRate = () => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const max = duration > 0 ? duration : 0;

  return (
    <div className="flex items-center gap-2 min-w-[13rem] max-w-xs py-0.5">
      <button
        type="button"
        className={`btn btn-circle btn-sm shrink-0 ${mine ? "bg-primary-content/20 border-0 text-primary-content hover:bg-primary-content/30" : "btn-primary"}`}
        onClick={toggle}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4 ml-0.5" />}
      </button>
      <input
        type="range"
        min={0}
        max={max || 1}
        step={0.05}
        value={Math.min(time, max || 1)}
        onChange={(e) => {
          const t = Number(e.target.value);
          setTime(t);
          if (audioRef.current) audioRef.current.currentTime = t;
        }}
        className={`range range-xs flex-1 ${mine ? "[--range-bg:var(--color-primary-content)]" : "range-primary"}`}
        aria-label="Seek"
        disabled={!max}
      />
      <span className="text-[11px] tabular-nums opacity-80 shrink-0">
        {formatDuration((playing || time > 0 ? time : max) * 1000)}
      </span>
      <button
        type="button"
        className="text-[11px] font-medium opacity-80 hover:opacity-100 shrink-0"
        onClick={cycleRate}
        aria-label={`Playback speed ${rate}x`}
      >
        {rate}x
      </button>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setTime(0);
        }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
      />
    </div>
  );
}
