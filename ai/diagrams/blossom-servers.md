# Blossom Server Architecture

This document describes the different types of Blossom servers used in nostube, how they are configured, and how they are used.

## Server Types Overview

```mermaid
flowchart TB
    subgraph "Blossom Server Types"
        direction TB

        subgraph upload["Upload Servers"]
            U1[/"Direct file storage"/]
            U2["BUD-10 chunked uploads"]
            U3["SHA256 hash verification"]
        end

        subgraph mirror["Mirror Servers"]
            M1[/"Redundant copies"/]
            M2["Copy from upload server"]
            M3["No duplicate uploads"]
        end

        subgraph cache["Caching/Proxy Servers"]
            C1[/"Media transformation"/]
            C2["Transcoding on-the-fly"]
            C3["CDN-style delivery"]
        end

        subgraph thumb["Thumbnail Resize Server"]
            T1[/"Image optimization"/]
            T2["imgproxy compatible"]
            T3["WebP conversion"]
        end
    end

    style upload fill:#e1f5fe
    style mirror fill:#f3e5f5
    style cache fill:#fff3e0
    style thumb fill:#e8f5e9
```

## Configuration Hierarchy

```mermaid
flowchart TD
    subgraph priority["Configuration Priority (highest to lowest)"]
        direction TB

        USER["1. User Settings<br/>(localStorage + Nostr)"]
        PRESET["2. Admin Preset<br/>(NIP-78, kind 30078)"]
        DEFAULT["3. App Defaults<br/>(hardcoded)"]

        USER --> PRESET --> DEFAULT
    end

    subgraph user_config["User Configurable"]
        BS["blossomServers[]<br/>upload + mirror"]
        CS["cachingServers[]<br/>media proxy"]
        TS["thumbResizeServerUrl<br/>single URL"]
    end

    subgraph preset_config["Preset Configurable"]
        DBP["defaultBlossomProxy"]
        DTS["defaultThumbResizeServer"]
        DR["defaultRelays[]"]
    end

    subgraph defaults["App Defaults"]
        DRS["imgproxy.nostu.be"]
        EMPTY["empty server lists"]
    end

    USER -.-> user_config
    PRESET -.-> preset_config
    DEFAULT -.-> defaults
```

## User Configuration Flow

```mermaid
flowchart LR
    subgraph settings["Settings Pages"]
        BS_PAGE["Blossom Servers<br/>/settings/blossom"]
        CS_PAGE["Caching Servers<br/>/settings/caching"]
        GS_PAGE["General Settings<br/>/settings"]
    end

    subgraph storage["Storage"]
        LOCAL["localStorage<br/>(AppConfig)"]
        NOSTR["Nostr<br/>(kind 30000)"]
    end

    BS_PAGE -->|"upload/mirror servers"| LOCAL
    BS_PAGE -->|"sync"| NOSTR
    CS_PAGE -->|"caching servers"| LOCAL
    GS_PAGE -->|"thumbnail server URL"| LOCAL

    NOSTR -->|"useUserBlossomServers()"| BS_PAGE
```

## Upload Server Flow

```mermaid
sequenceDiagram
    participant User
    participant App as nostube
    participant Upload as Upload Server
    participant Mirror as Mirror Server(s)

    User->>App: Select file to upload
    App->>App: Calculate SHA256 hash

    loop For each upload server
        App->>Upload: HEAD /sha256 (check exists)
        alt File exists
            Upload-->>App: 200 OK (skip upload)
        else File not found
            App->>Upload: PATCH /upload (chunked)
            Note over App,Upload: BUD-10 chunked upload<br/>with progress tracking
            Upload-->>App: 200 OK + blob descriptor
        end
    end

    loop For each mirror server
        App->>Mirror: HEAD /sha256 (check exists)
        alt File exists
            Mirror-->>App: 200 OK (skip)
        else File not found
            App->>Mirror: PUT /mirror?url=...
            Mirror-->>App: 200 OK
        end
    end

    App->>App: Create video event with imeta URLs
    App->>User: Upload complete
```

## Video Playback URL Resolution

```mermaid
flowchart TD
    subgraph input["Video Event"]
        IMETA["imeta tags with URLs"]
    end

    subgraph resolution["useMediaUrls() Resolution"]
        direction TB

        PROXY["1. Generate Proxy URLs<br/>(from caching servers)"]
        ORIGINAL["2. Add Original URLs<br/>(from imeta)"]
        MIRROR["3. Generate Mirror URLs<br/>(from user's mirror servers)"]
        FALLBACK["4. Add Fallback URLs<br/>(non-Blossom sources)"]

        PROXY --> ORIGINAL --> MIRROR --> FALLBACK
    end

    subgraph player["Video Player"]
        TRY["Try URL"]
        NEXT["Next URL on error"]
        TRY -->|"error"| NEXT
        NEXT -->|"retry"| TRY
    end

    IMETA --> resolution
    resolution --> player

    style PROXY fill:#fff3e0
    style ORIGINAL fill:#e1f5fe
    style MIRROR fill:#f3e5f5
```

## Proxy URL Generation

```mermaid
flowchart LR
    subgraph input["Input"]
        URL["Original Blossom URL"]
        CONFIG["Caching Server Config"]
    end

    subgraph generate["generateProxyUrls()"]
        PARSE["Parse original URL"]
        BUILD["Build proxy URL with params"]
    end

    subgraph params["Query Parameters"]
        XS["xs = fallback servers"]
        AS["as = author pubkey"]
        WH["width/height = sizing"]
    end

    subgraph output["Output"]
        PROXY_URL["Proxy URL<br/>https://cache.example.com/sha256?xs=..."]
    end

    URL --> PARSE
    CONFIG --> BUILD
    PARSE --> BUILD
    params --> BUILD
    BUILD --> output
```

## Thumbnail Resize Flow

```mermaid
flowchart LR
    subgraph input["Input"]
        IMG_URL["Image URL"]
        VID_URL["Video URL"]
    end

    subgraph functions["Proxy Functions"]
        IP["imageProxy()"]
        IPV["imageProxyVideoThumbnail()"]
    end

    subgraph imgproxy["imgproxy Format"]
        FORMAT["/insecure/f:webp/rs:fit:480:480/plain/{url}"]
    end

    subgraph output["Output"]
        THUMB["Optimized WebP thumbnail"]
    end

    IMG_URL --> IP --> imgproxy
    VID_URL --> IPV --> imgproxy
    imgproxy --> output
```

## Server Data Structures

```mermaid
classDiagram
    class BlossomServer {
        +string url
        +string name
        +string[] tags
    }
    note for BlossomServer "tags: 'mirror' | 'initial upload'"

    class CachingServer {
        +string url
        +string name
    }

    class AppConfig {
        +BlossomServer[] blossomServers
        +CachingServer[] cachingServers
        +string thumbResizeServerUrl
    }

    class NostubePreset {
        +string[] defaultRelays
        +string defaultBlossomProxy
        +string defaultThumbResizeServer
        +string[] blockedPubkeys
    }

    AppConfig --> BlossomServer
    AppConfig --> CachingServer
```

## Complete Upload to Playback Flow

```mermaid
flowchart TB
    subgraph upload_phase["Upload Phase"]
        FILE["Video File"]
        HASH["Calculate SHA256"]
        UP["Upload to Upload Servers"]
        MIR["Mirror to Mirror Servers"]
        EVENT["Create Video Event<br/>(kind 34235/34236)"]

        FILE --> HASH --> UP --> MIR --> EVENT
    end

    subgraph publish["Publish"]
        RELAY["Publish to Relays"]
        EVENT --> RELAY
    end

    subgraph playback_phase["Playback Phase"]
        LOAD["Load Video Event"]
        URLS["Resolve URLs<br/>(proxy → original → mirror)"]
        PLAYER["Video Player<br/>(with failover)"]

        RELAY --> LOAD --> URLS --> PLAYER
    end

    subgraph servers["Server Usage"]
        direction LR
        S_UP["Upload Servers<br/>(store)"]
        S_MIR["Mirror Servers<br/>(replicate)"]
        S_CACHE["Caching Servers<br/>(transform/deliver)"]
        S_THUMB["Thumbnail Server<br/>(optimize images)"]
    end

    UP -.-> S_UP
    MIR -.-> S_MIR
    URLS -.-> S_CACHE
    URLS -.-> S_THUMB

    style upload_phase fill:#e3f2fd
    style playback_phase fill:#f3e5f5
```

## Server Feature Comparison

```mermaid
quadrantChart
    title Server Capabilities
    x-axis Low Write --> High Write
    y-axis Low Read --> High Read
    quadrant-1 Read-heavy
    quadrant-2 Balanced
    quadrant-3 Write-heavy
    quadrant-4 Specialized

    Upload Server: [0.8, 0.3]
    Mirror Server: [0.6, 0.4]
    Caching Server: [0.1, 0.9]
    Thumbnail Server: [0.1, 0.8]
```

## Key Files Reference

| File                                                | Purpose                              |
| --------------------------------------------------- | ------------------------------------ |
| `src/lib/blossom-upload.ts`                         | Upload, mirror, chunked operations   |
| `src/lib/media-url-generator.ts`                    | Generate URLs with mirrors + proxies |
| `src/lib/blossom-url.ts`                            | URL detection and validation         |
| `src/hooks/useMediaUrls.ts`                         | URL failover and discovery           |
| `src/hooks/useUserBlossomServers.ts`                | Load user's servers from Nostr       |
| `src/components/settings/BlossomServersSection.tsx` | Upload/mirror server config UI       |
| `src/components/settings/CachingServersSection.tsx` | Caching server config UI             |
| `src/contexts/AppContext.ts`                        | Central config storage               |
| `src/lib/utils.ts`                                  | Image proxy functions                |

## Default Servers

```mermaid
flowchart LR
    subgraph recommended["Recommended Upload Servers"]
        A["almond.slidestr.net<br/>(chunked support)"]
        B["blossom.primal.net"]
        C["24242.io"]
    end

    subgraph defaults["Default Mirrors"]
        M1["blossom.primal.net"]
        M2["24242.io"]
    end

    subgraph thumb_default["Default Thumbnail"]
        T["imgproxy.nostu.be"]
    end
```
