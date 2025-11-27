/* Nostube Embed Player v0.1.0 | https://nostube.com */
(()=>{function o(){let e=new URLSearchParams(window.location.search);return{videoId:e.get("v")||"",autoplay:e.get("autoplay")==="1",muted:e.get("muted")==="1",loop:e.get("loop")==="1",startTime:parseInt(e.get("t")||"0",10),controls:e.get("controls")!=="0",showTitle:e.get("title")!=="0",showBranding:e.get("branding")!=="0",preferredQuality:e.get("quality")||"auto",customRelays:e.get("relays")?e.get("relays").split(",").map(t=>t.trim()):[],accentColor:e.get("color")||"8b5cf6"}}function r(e){return e.videoId?!e.videoId.startsWith("nevent1")&&!e.videoId.startsWith("naddr1")&&!e.videoId.startsWith("note1")?{valid:!1,error:"Invalid video ID format. Must be nevent1..., naddr1..., or note1..."}:{valid:!0}:{valid:!1,error:"Missing required parameter: v (video ID)"}}async function i(){console.log("[Nostube Embed] Initializing player...");let e=o(),t=r(e);if(!t.valid){console.error("[Nostube Embed] Invalid configuration:",t.error),a(t.error);return}console.log("[Nostube Embed] Configuration:",e)}function a(e){document.body.innerHTML=`
    <div style="display: flex; align-items: center; justify-content: center;
                height: 100vh; background: #000; color: #fff;
                font-family: system-ui, -apple-system, sans-serif;
                text-align: center; padding: 20px;">
      <div>
        <div style="font-size: 48px; margin-bottom: 16px;">\u26A0\uFE0F</div>
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">Error</div>
        <div style="font-size: 14px; color: #999;">${e}</div>
      </div>
    </div>
  `}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",i):i();})();
