# Understanding Video Uploads in NosTube: A Deep Dive into Modern Decentralized Storage

## Introduction

Video uploading might seem simple on the surface—you select a file, click upload, and wait for it to finish. But behind the scenes in NosTube, there's a sophisticated system working to ensure your videos are stored reliably, efficiently, and in a decentralized manner. In this article, we'll explore two groundbreaking concepts that make this possible: **temp storage (initial upload)** and **chunked uploads**—both innovations in the Blossom protocol.

Whether you're a content creator, a developer, or simply curious about how decentralized video platforms work, this guide will help you understand the magic happening behind that upload button.

## What is Blossom?

Before diving into the upload process, let's understand what Blossom is. **Blossom** is a decentralized file storage protocol built specifically for the Nostr ecosystem. Think of it as a modern, privacy-respecting alternative to centralized cloud storage services like Amazon S3 or Google Cloud Storage.

Unlike traditional cloud storage where one company controls all your files, Blossom allows you to:

- Store files across multiple independent servers
- Maintain ownership and control of your content
- Verify file integrity using cryptographic hashes
- Authenticate uploads using your Nostr identity

In NosTube, when you upload a video, you're not sending it to a single server owned by one company. Instead, you're distributing it across a network of Blossom servers, ensuring better reliability and censorship resistance.

## The Upload Journey: From Your Device to the Decentralized Web

When you upload a video to NosTube, it goes through several stages. Let's walk through each one.

### Stage 1: File Selection and Preparation

First, you select your video file. NosTube immediately starts analyzing it to extract important information:

- **Video dimensions** (1080p, 720p, etc.)
- **Codec information** (H.264, H.265, VP9, AV1)
- **File size and duration**
- **Audio codec**

This metadata is crucial because it helps viewers know what to expect and ensures compatibility across different devices. For example, some browsers and devices don't support certain codecs like AV1 or VP9, so NosTube warns you about potential compatibility issues.

### Stage 2: SHA256 Hash Calculation

Before uploading begins, NosTube calculates a **SHA256 hash** of your video file.

**What's a hash?** Think of it as a unique fingerprint for your file. No matter how large your video is—whether it's 100MB or 5GB—the hash is always a fixed-length string of characters. This fingerprint serves several purposes:

1. **Deduplication**: If the exact same video already exists on a server, there's no need to upload it again
2. **Integrity verification**: The hash ensures your video wasn't corrupted during upload
3. **Content addressing**: Your video can be retrieved using its hash, not just a traditional filename

For large files, this hash calculation is done in **chunks** (20MB at a time) to avoid loading the entire video into your device's memory at once. This is especially important for multi-gigabyte video files that could crash your browser if loaded all at once.

### Stage 3: Server Availability Check

Before uploading, NosTube checks if your file already exists on any of your configured Blossom servers. It does this by making a simple "HEAD" request with your file's hash.

If the server responds with "200 OK", it means the file is already there—no upload needed! This saves bandwidth and time. The system simply creates a reference to the existing file rather than uploading a duplicate.

### Stage 4: Initial Upload (Temp Storage)

Here's where things get interesting. NosTube uses a concept called **temp storage** or **initial upload** to store your video.

#### What is Temp Storage?

Temp storage refers to the **first server** where your video gets uploaded. Think of it as your video's "home base." You configure which servers should be your temp storage in the Settings → Blossom Servers section, marking them with the "initial upload" tag.

#### Why Use Temp Storage?

The temp storage concept solves a practical problem: uploading large files to multiple servers simultaneously can be slow and unreliable. Instead of uploading the same 2GB video file to 5 different servers (which would transfer 10GB total), you:

1. **Upload once** to your temp storage server
2. **Mirror** from there to other servers (they copy it between themselves)

This is much faster because:

- Server-to-server transfers are typically faster than client-to-server
- You only consume your upload bandwidth once
- The process is more reliable (servers have better connections than mobile devices)

#### The Upload Process

When uploading to your temp storage, NosTube uses either:

1. **Chunked upload** (if the server supports it) - described in detail below
2. **Regular upload** (fallback for servers that don't support chunked uploads)

The system automatically detects which method to use by making an "OPTIONS" request to the server's `/upload` endpoint, checking for support of the PATCH method (required for chunked uploads).

### Stage 5: Chunked Upload (BUD-10 Protocol)

This is where the real innovation happens. **Chunked upload** is a technique that splits your large video file into smaller pieces (chunks) and uploads them one at a time.

#### Why Do We Need Chunked Uploads?

Imagine you're uploading a 3GB video from your phone while commuting on the train. Your connection keeps dropping every few minutes. With traditional uploads, every time your connection drops, you have to start over from the beginning. Frustrating, right?

Chunked uploads solve this by:

- **Breaking the file into manageable pieces** (typically 8-10MB each)
- **Uploading one chunk at a time**
- **Resuming from where it left off** if the connection drops
- **Providing detailed progress updates** (you can see "Uploading chunk 15 of 250")

#### How Chunked Uploads Work

NosTube implements the **BUD-10 specification** for chunked uploads, a standardized protocol for the Blossom ecosystem. Here's the step-by-step process:

**Step 1: Capability Negotiation**

Before starting, NosTube asks the server: "Do you support chunked uploads?"

```
OPTIONS /upload
```

The server responds with headers indicating its capabilities:

- `Accept-Patch`: Confirms PATCH support
- `Blossom-Upload-Modes`: Lists supported upload modes
- `Max-Chunk-Size`: Recommended chunk size (if any)

**Step 2: File Chunking**

Your video file is split into chunks using the browser's `Blob.slice()` method. This is memory-efficient because it doesn't load the entire file into RAM—it just creates references to parts of the file.

For example, a 240MB video with 8MB chunks becomes:

- Chunk 0: bytes 0 to 8,388,608
- Chunk 1: bytes 8,388,608 to 16,777,216
- Chunk 2: bytes 16,777,216 to 25,165,824
- ... and so on for 30 chunks total

**Step 3: Authorization**

Each upload requires cryptographic authentication using your Nostr identity. NosTube creates a signed authorization event containing:

- Your file's SHA256 hash
- Timestamp
- Your Nostr public key

This proves you own your Nostr account and have the right to upload to the server.

**Step 4: Sequential Chunk Upload**

Each chunk is uploaded using the PATCH method with specific headers:

```http
PATCH /upload
Content-Type: application/octet-stream
X-SHA-256: [your-file-hash]
Upload-Type: video/mp4
Upload-Length: 251658240
Upload-Offset: 0
Content-Length: 8388608
Authorization: Nostr [base64-encoded-auth-event]

[chunk data]
```

Notice the `Upload-Offset` header—this tells the server exactly where this chunk belongs in the final file.

**Step 5: Progress Tracking**

As each chunk uploads, NosTube updates the progress bar showing:

- **Percentage complete** (e.g., 45%)
- **Current chunk** (e.g., chunk 15 of 30)
- **Upload speed** (e.g., 2.5 MB/s)
- **Bytes transferred** (e.g., 112 MB of 240 MB)

This granular feedback keeps you informed and lets you know exactly how much longer the upload will take.

**Step 6: Final Chunk and Completion**

The last chunk is special—when the server receives it, it knows the upload is complete. It assembles all the chunks, verifies the SHA256 hash matches what you claimed, and returns a **BlobDescriptor** JSON response:

```json
{
  "sha256": "a7b3c9d2e...",
  "size": 251658240,
  "type": "video/mp4",
  "url": "https://blossom-server.com/a7b3c9d2e...",
  "uploaded": 1700000000000
}
```

This descriptor contains everything needed to reference your video in the future.

#### Handling Upload Failures

What if a chunk fails to upload? NosTube's chunked upload system will:

1. Retry that specific chunk (not the whole file)
2. If all chunks fail, throw a clear error message
3. Never fall back to regular upload mid-stream (to maintain BUD-10 compliance)

If the server doesn't support chunked uploads at all, NosTube falls back to a traditional PUT upload for the entire file.

### Stage 6: Mirroring to Additional Servers

Once your video is safely stored on your temp storage server, NosTube can **mirror** it to additional servers for redundancy and availability.

#### What is Mirroring?

Mirroring is the process of copying your video from one Blossom server to another. Instead of uploading from your device again, you tell Server B: "Please copy this file from Server A."

The mirror request looks like this:

```http
PUT /mirror
Content-Type: application/json
Authorization: Nostr [base64-encoded-auth-event]

{
  "url": "https://server-a.com/a7b3c9d2e..."
}
```

Server B then:

1. Downloads the file from Server A
2. Verifies the SHA256 hash
3. Stores it locally
4. Returns a BlobDescriptor confirming success

#### Why Mirror?

Mirroring provides several benefits:

1. **Redundancy**: If one server goes offline, your video is still available on others
2. **Geographic distribution**: Servers in different locations mean faster load times for viewers worldwide
3. **Censorship resistance**: No single server can take down your content
4. **Bandwidth efficiency**: You upload once, but your video becomes available on multiple servers

In NosTube's settings, you can configure which servers should receive mirrors by tagging them with "mirror" in the Blossom Servers section.

### Stage 7: Publishing the Nostr Event

After uploading and mirroring, NosTube creates a **Nostr event** (kind 34235 for addressable videos or kind 21 for regular videos) containing:

- **Video title and description**
- **Hashtags**
- **Content warnings** (if applicable)
- **Multiple `imeta` tags** (one for each video quality variant)

Each `imeta` tag includes:

- Video URL
- Fallback URLs (from mirror servers)
- File size, dimensions, duration
- Video and audio codecs
- SHA256 hash

Here's a simplified example:

```json
{
  "kind": 34235,
  "content": "Check out my awesome video!",
  "tags": [
    ["title", "My Amazing Video"],
    ["published_at", "1700000000"],
    ["t", "tutorial"],
    ["t", "nostr"],
    [
      "imeta",
      "url https://server1.com/abc123...",
      "x a7b3c9d2e...",
      "m video/mp4",
      "size 251658240",
      "dim 1920x1080",
      "duration 180",
      "fallback https://server2.com/abc123...",
      "fallback https://server3.com/abc123..."
    ]
  ]
}
```

This event is broadcast to your configured Nostr relays, making your video discoverable across the decentralized network.

## Multiple Quality Variants

NosTube supports uploading the same video in multiple quality variants (e.g., 1080p, 720p, 480p). Each variant:

- Goes through the same upload → mirror → publish flow
- Gets its own `imeta` tag in the Nostr event
- Shares the same thumbnail (no need to upload multiple thumbnails)

This provides adaptive streaming benefits—viewers with slower connections can watch the lower quality version, while those with fast connections enjoy the full quality.

## The Benefits of This Approach

This sophisticated upload system provides numerous advantages:

### 1. **Reliability**

- Chunked uploads can resume from interruptions
- Multiple servers ensure availability even if one goes down
- Hash verification prevents corruption

### 2. **Efficiency**

- Deduplication prevents wasting bandwidth
- Server-to-server mirroring is faster than repeated uploads
- Streaming hash calculation avoids memory issues

### 3. **User Experience**

- Detailed progress feedback
- Codec compatibility warnings
- Automatic server availability checks

### 4. **Decentralization**

- No single point of failure
- Censorship resistant
- User controls which servers to use

### 5. **Privacy**

- Nostr-based authentication
- No email or personal data required
- Content-addressed storage

## Configuration Tips

To get the best upload experience in NosTube:

1. **Configure at least one "initial upload" server**: This is your temp storage
2. **Add 2-3 "mirror" servers**: For redundancy without excessive mirroring
3. **Choose servers with good uptime**: Check the Debug dialog to see server availability
4. **Use servers with chunked upload support**: For better reliability on large files

## Technical Details for Developers

If you're a developer interested in implementing similar functionality:

- **BUD-10 specification**: The standard for chunked uploads in Blossom
- **SHA256 streaming**: Use libraries like `hash-wasm` for memory-efficient hashing
- **Blob.slice()**: Browser API for chunking without loading entire files into memory
- **Nostr NIP-94**: The standard for file metadata events
- **Nostr NIP-96**: The standard for file upload events (though NosTube uses Blossom)

The complete implementation is open source in the NosTube repository:

- `src/lib/blossom-upload.ts`: Core upload logic
- `src/hooks/useVideoUpload.ts`: React hook for upload state management
- `src/components/VideoUpload.tsx`: UI components

## Conclusion

What appears as a simple upload button in NosTube's interface represents a carefully orchestrated dance of modern web technologies, cryptographic authentication, decentralized storage protocols, and user-centric design.

By combining **temp storage** (initial upload) with **chunked uploads**, NosTube provides a robust, efficient, and user-friendly way to share videos on the decentralized web. This approach ensures your content remains accessible, verifiable, and under your control—all while providing a smooth upload experience comparable to centralized platforms.

The future of video sharing is decentralized, and with protocols like Blossom and platforms like NosTube, that future is already here.

---

**Want to try it yourself?** Head over to NosTube, connect your Nostr account, and start uploading. Your videos, your servers, your control.

**Questions or feedback?** Join the Nostr community and share your thoughts. We're always improving and would love to hear from you!
