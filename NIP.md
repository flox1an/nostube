# NIP-71: Nostr Video Protocol

## Abstract
NIP-71 defines a protocol for sharing video content on the Nostr network using kind `34235` events.

## Event Structure

### Video Event (Kind: 34235)
A video event uses the replaceable parameterized format with the following structure:

Required tags:
- `d`: The unique video identifier
- `title`: Video title
- `url`: URL to the video file or manifest
- `m`: MIME type of the video content (e.g., "video/mp4", "application/vnd.apple.mpegurl")
- `thumb`: URL to a thumbnail image
- `duration`: Length of the video in seconds

Optional tags:
- `description`: Description of the video
- `summary`: Short version of the video description
- `published_at`: Original publication timestamp
- `t`: Topic/category tags for the video content
- `size`: Size of the video file in bytes
- `dim`: Video dimensions in format "WIDTHxHEIGHT"
- `blurhash`: BlurHash representation of the thumbnail
- `location`: Geographic location associated with the video
- `subject`: Alternative to title for discovery

### Video Comment (Kind: 1)
Video comments use standard Nostr kind 1 notes with an `e` tag referencing the video event ID.

Required tags:
- `e`: Event ID of the video being commented on
- `p`: Pubkey of the video author

The content field contains the comment text.

## Tag Usage
- `d`: Required for addressable events. Video identifier for uniqueness.
- `m`: Must contain valid MIME type for video content.
- `thumb`: Should be HTTPS URL to image in common web format.
- `url`: Must be HTTPS URL to video content or HLS manifest.
- `duration`: Integer value in seconds.

## Examples

Example video event:
```json
{
  "kind": 34235,
  "created_at": 1234567890,
  "tags": [
    ["d", "my-awesome-video-2023"],
    ["title", "My Awesome Video"],
    ["url", "https://example.com/video.mp4"],
    ["m", "video/mp4"],
    ["thumb", "https://example.com/thumb.jpg"],
    ["duration", "120"],
    ["description", "This is my awesome video about Nostr"],
    ["t", "nostr"],
    ["t", "tutorial"]
  ],
  "content": "This is my awesome video about Nostr",
  "pubkey": "abc123..."
}
```