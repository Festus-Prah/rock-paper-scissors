// ...existing code...
function fetchUsername() {
    fetch('/api/username') // Ensure correct relative path
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
            }
            return response.text();
        })
        .then(username => {
            document.getElementById('username').textContent = username;
        })
        .catch(error => {
            console.error('Error fetching username:', error);
        });
}
// ...existing code...
