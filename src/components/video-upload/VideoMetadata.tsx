interface VideoMetadataProps {
  dimension?: string;
  sizeMB?: number;
  duration?: number;
  videoCodec?: string;
  audioCodec?: string;
  inputMethod: 'file' | 'url';
}

export function VideoMetadata({
  dimension,
  sizeMB,
  duration,
  videoCodec,
  audioCodec,
  inputMethod
}: VideoMetadataProps) {
  return (
    <div className="mt-0 p-3 bg-muted rounded border text-sm">
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 items-center">
        <div className="text-muted-foreground">Dimension:</div>
        <div>
          <span className="font-mono">{dimension}</span>
        </div>
        {inputMethod === 'file' && sizeMB && (
          <>
            <div className="text-muted-foreground">Size:</div>
            <div>
              <span className="font-mono">{sizeMB} MB</span>
            </div>
          </>
        )}
        <div className="text-muted-foreground">Duration:</div>
        <div>
          <span className="font-mono">{duration} seconds</span>
        </div>
        {videoCodec && (
          <>
            <div className="text-muted-foreground">Video Codec:</div>
            <div>
              <span className="font-mono">{videoCodec}</span>
            </div>
            {videoCodec.startsWith('av01') && (
              <div className="col-span-2 mt-2 text-sm text-yellow-700 bg-yellow-100 border border-yellow-300 rounded p-2">
                <b>Warning:</b> AV1 videos (<code>av01</code>) cannot be played on iOS or Safari browsers.
                Please use H.264/AVC for maximum compatibility.
              </div>
            )}
            {videoCodec.startsWith('vp09') && (
              <div className="col-span-2 mt-2 text-sm text-yellow-700 bg-yellow-100 border border-yellow-300 rounded p-2">
                <b>Warning:</b> VP9 videos (<code>vp09</code>) are not supported on iOS or Safari browsers.
                For maximum compatibility, use H.264/AVC.
              </div>
            )}
            {videoCodec.startsWith('hev1') && (
              <div className="col-span-2 mt-2 text-sm text-yellow-700 bg-yellow-100 border border-yellow-300 rounded p-2">
                <b>Warning:</b> While H.265 (<code>hev1</code>) is widely supported, this video will not play on iOS/Apple devices.
                A <code>hvc1</code> codec identifier is needed.
              </div>
            )}
            {videoCodec.startsWith('hvc1') && (
              <div className="col-span-2 mt-2 text-sm text-blue-800 bg-blue-100 border border-blue-300 rounded p-2">
                <b>Info:</b> H.265/HEVC (<code>hvc1</code>) is widely supported. Only some de-googled Linux
                browsers may have issues.
              </div>
            )}
            {videoCodec.startsWith('avc1') && (
              <div className="col-span-2 mt-2 text-sm text-green-800 bg-green-100 border border-green-300 rounded p-2">
                <b>Great:</b> H. поддержку.264/AVC (<code>avc1</code>) is the most widely supported video codec and
                will play on all browsers and devices.
              </div>
            )}
          </>
        )}

        {audioCodec && (
          <>
            <div className="text-muted-foreground">Audio Codec:</div>
            <div>
              <span className="font-mono">{audioCodec}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
