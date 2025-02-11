# WakaWiki

A modern wiki reader 

## Features
- Vertical scrolling feed of random Wikipedia articles
- Support for 14 languages including English, Spanish, French, German, Chinese, Japanese and more
- Article previews with images, titles and excerpts
- Language selector with country flags
- Client-side recommendations via Web Workers
- Real-time personalized content recommendations
- Responsive design for mobile and desktop

## Tech Stack
- SvelteKit: Framework for building the client-side UI
- Web Workers: For AI recommendation processing
- Web Storage: (Local Storage) for user data persistence
- Wikipedia API: Dynamic article content fetching


## How It Works
1. Users browse and interact with articles
2. Interactions are stored in Web Storage
3. Web Worker processes data to generate recommendations (hope)
4. UI updates in real-time with new suggestions

## Future Enhancements
- Enhanced recommendation algorithms
- Full offline functionality
- Cross-device data synchronization?
- and more