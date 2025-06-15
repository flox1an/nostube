# NIP-XX: Video Playlists

## Abstract

This NIP defines how video playlists are stored and shared on the Nostr network.

## Event Types

### Video Playlist (Kind: 10100)

A replaceable event that stores a user's video playlists. Each playlist contains a name, description, and list of video references.

#### Event Content

The content field contains a JSON object with the following structure:

```json
{
  "playlists": [
    {
      "id": "unique-playlist-id",
      "name": "Playlist Name",
      "description": "Optional playlist description",
      "videos": [
        {
          "id": "video-event-id",
          "added_at": 1234567890
        }
      ]
    }
  ]
}
```

#### Tags

- Recommended: `["client", "playplay"]` to identify the client application