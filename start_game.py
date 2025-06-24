import http.server
import socketserver
import webbrowser
import os

# --- Game Configuration ---
PORT = 8080
# The primary HTML file to serve. It will link to CSS and JS.
HTML_FILENAME = "curling.html"
# Specify the directory where game files are located.
# For SimpleHTTPRequestHandler, if files are in the same directory as the script,
# no special path handling is needed beyond ensuring the CWD is correct or files are findable.
# If your files (curling.html, style.css, curling.js) are in the root where start_game.py is,
# then SimpleHTTPRequestHandler will find them automatically.

class GameRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Ensure that requests for the root path '/' serve the HTML_FILENAME
        if self.path == '/':
            self.path = HTML_FILENAME
        return http.server.SimpleHTTPRequestHandler.do_GET(self)

def create_and_launch_game():
    """Starts a server and opens the browser, serving curling.html."""
    print("--------------------------------------")
    print("--- Python Local Game Launcher ---")
    print("--------------------------------------")

    # Check if the main HTML file exists
    if not os.path.exists(HTML_FILENAME):
        print(f"❌ Error: Main game file '{HTML_FILENAME}' not found in the current directory.")
        print(f"   Please ensure '{HTML_FILENAME}', 'style.css', and 'curling.js' are present.")
        # Attempt to create a placeholder if it's missing, to avoid server errors if user wants to proceed
        # This is not ideal for production but helps if files were deleted/moved.
        # For this project, we assume files are created by previous steps.
        # So, if it's missing here, it's a genuine issue.
        return


    # 1. Set up and start a simple local web server
    Handler = GameRequestHandler # Use our custom handler
    httpd = None
    current_port = PORT
    max_retries = 10

    for i in range(max_retries):
        try:
            # Ensure the server runs from the directory containing the game files.
            # If start_game.py is in the same directory as curling.html, style.css, curling.js,
            # then no change to directory (os.chdir) is needed.
            # SimpleHTTPRequestHandler serves files from the current working directory.
            httpd = socketserver.TCPServer(("", current_port), Handler)
            print(f"✅ Server started successfully on port {current_port}.")
            print(f"➡️  Serving files from the current directory.")
            print(f"➡️  Main game page: http://localhost:{current_port}/{HTML_FILENAME}")
            break
        except OSError as e:
            if "address already in use" in str(e).lower() or \
               "only one usage of each socket address" in str(e).lower():
                print(f"⚠️ Port {current_port} is in use. Trying next port...")
                current_port += 1
            else:
                print(f"\n❌ Critical Error: Could not start the server.")
                print(f"   Error details: {e}")
                return
        if i == max_retries - 1 and httpd is None:
            print(f"\n❌ Critical Error: Could not find an available port after {max_retries} attempts.")
            return

    if httpd is None: # Should not happen if loop logic is correct
        print(f"\n❌ Critical Error: Failed to initialize the server.")
        return

    try:
        with httpd:
            # The GameRequestHandler will serve curling.html for '/'
            game_url = f"http://localhost:{current_port}/"
            
            print(f"🚀 Launching game in your browser: {game_url}")
            webbrowser.open_new_tab(game_url)

            print("\n--------------------------------------")
            print("  The game is now running in your browser.")
            print("  Keep this Python script running to serve the game files.")
            print("  Press CTRL+C here to stop the server.")
            print("--------------------------------------\n")
            
            httpd.serve_forever()

    except OSError as e:
        print(f"\n❌ Critical Error encountered during server operation or browser launch.")
        print(f"   Error details: {e}")
    except KeyboardInterrupt:
        print("\n--------------------------------------")
        print("🛑 Server stopped by user.")
        print("   Closing the application. Goodbye!")
        print("--------------------------------------")
    finally:
        # No files to clean up here as they are part of the project structure now.
        pass

if __name__ == "__main__":
    # Optional: Change directory to the script's location if needed
    # script_dir = os.path.dirname(os.path.abspath(__file__))
    # os.chdir(script_dir)
    # This is useful if the script is run from a different CWD.
    # For now, assume it's run from the root of the game files.
    create_and_launch_game()
