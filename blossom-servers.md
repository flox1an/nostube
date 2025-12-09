# Blossom Server Comparison

| Server               | Status             | CDN        | Mirror | Storage        | Range Requests | Max File Size | Max Retention | Payment        | Notes                                                                                    |
| -------------------- | ------------------ | ---------- | ------ | -------------- | -------------- | ------------- | ------------- | -------------- | ---------------------------------------------------------------------------------------- |
| almond.slidestr.net  | ✅ OK              | ?          | ✅ Yes | ?              | ?              | ?             | ?             | ?              | Supports chunked upload                                                                  |
| blossom.primal.net   | ✅ OK              | Bunny Net  | ?      | ?              | ?              | ?             | ?             | ?              |                                                                                          |
| 24242.io             | ✅ OK              | BunnyCDN   | ?      | ?              | ✅ Yes         | 100MB         | 60 days       | Free           |                                                                                          |
| blossom.band         | ✅ OK              | Cloudflare | ✅ Yes | ?              | ✅ Yes         | -             | Payment       | $0.05/GB/Month | Lightning payment. Extension: X-Moderation: SAFE:0.986, QUESTIONABLE:0.004, UNSAFE:0.010 |
| cdn.nostrcheck.me    | ⚠️ NOT RECOMMENDED | ?          | ✅ Yes | ?              | ?              | ?             | ?             | ?              | Resizes video, not Blossom compatible. 404 error page returns image with status 200      |
| blossom.sector01.com | ✅ OK              | ?          | ?      | ?              | ?              | ?             | ?             | ?              |                                                                                          |
| cdn.satellite.earth  | ✅ OK              | Cloudflare | ✅ Yes | Cloudflare R2? | ?              | -             | Payment       | $0.05/GB/Month | Lightning payment                                                                        |
| Yakihonne            | 📋 TODO            | ?          | ?      | ?              | ?              | ?             | ?             | ?              |                                                                                          |
| nostr.download       | ❌ Error           | ?          | ?      | ?              | ?              | ?             | ?             | ?              | CORS error: X-SHA-256 header not allowed in preflight response                           |
| nosto.re             | ❌ NO              | ?          | ?      | ?              | ?              | ?             | ?             | ?              |                                                                                          |

## Legend

- ✅ OK: Server is working and recommended
- ⚠️ NOT RECOMMENDED: Server has compatibility issues
- 📋 TODO: Server needs testing
- ❌ Error: Server has technical issues
- ❌ NO: Server is not supported/not working
- `?` = Unknown/Not tested
- `-` = No limit or not applicable

## Testing Methodology

### Mirror Test

Tests whether the server accepts mirrored content from other Blossom servers.

### Chunked Upload Test

Tests whether the server supports chunked upload for large files (tested with almond.slidestr.net).

## Known Issues

### cdn.nostrcheck.me

- **Not Blossom Compatible**: Resizes videos and serves them under the original blob hash
- **Incorrect HTTP Status**: Returns 404 error pages as images with status 200
- **Recommendation**: Avoid using this server for Blossom operations

### nostr.download

- **CORS Issue**: Request header `X-SHA-256` is not allowed by Access-Control-Allow-Headers in preflight response
- **Status**: Cannot be used from browser-based applications

## Payment Details

Some servers offer paid storage with extended retention:

- **blossom.band**: ~$0.05/GB/Month via Lightning
- **cdn.satellite.earth**: ~$0.05/GB/Month via Lightning

## Extensions

### X-Moderation Header (blossom.band)

Provides AI-based content moderation scores:

- `SAFE: 0.986`
- `QUESTIONABLE: 0.004`
- `UNSAFE: 0.010`
