# Polyactyl Examples

This directory contains example `.http` files that demonstrate how to use Polyactyl with various public APIs. These examples are perfect for getting started and exploring Polyactyl's features.

## Files

### httpbin-demo.http
Demonstrates basic HTTP operations using [HTTPBin](https://httpbin.org/), a free service for testing HTTP requests.

Includes:
- Simple GET requests
- POST requests with JSON data
- Headers inspection
- Status code testing
- Response delays
- IP and User-Agent endpoints

### jsonplaceholder-demo.http
Examples using [JSONPlaceholder](https://jsonplaceholder.typicode.com/), a fake JSON API for testing and prototyping.

Includes:
- Reading posts and comments
- Creating new posts (POST)
- Updating posts (PUT)
- Deleting posts (DELETE)
- Fetching users and todos

### public-apis-demo.http
A collection of requests to various free public APIs:

- **PokéAPI** - Pokémon data and information
- **OpenWeather** - Weather information
- **ReqRes** - User management testing
- **Dog CEO API** - Random dog images and breed information

### advanced-requests.http
More complex HTTP request patterns:

- Form data submissions
- Bearer token authentication
- Custom headers
- GraphQL queries
- XML content
- Large JSON payloads
- Basic authentication
- HTTP redirects
- Different content types

## Getting Started

1. Open Polyactyl
2. Browse to the `examples` folder
3. Click on any `.http` file to open it
4. Click on a request header (e.g., `### HTTPBin - Simple GET`)
5. Press the send button or use the keyboard shortcut to execute the request
6. View the response in the response panel

## About the APIs

All APIs used in these examples are:
- **Free** - No payment or subscription required
- **Public** - No authentication credentials needed (except as demonstrated)
- **Reliable** - Designed for testing and learning
- **HTTPS** - All requests use secure connections

## Tips

- You can send multiple requests from the same file sequentially
- Responses are displayed with syntax highlighting and pretty-printing
- Timings show how long each request took
- Status codes help diagnose any issues
- Feel free to modify these examples to test different scenarios

## Resources

- [HTTPBin Documentation](https://httpbin.org/)
- [JSONPlaceholder Guide](https://jsonplaceholder.typicode.com/)
- [PokéAPI Docs](https://pokeapi.co/docs/v2)
- [ReqRes](https://reqres.in/)
- [Dog CEO API](https://dog.ceo/dog-api)

Happy requesting! 🐾
