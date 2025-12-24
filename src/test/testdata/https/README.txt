HTTPS certificates generated as follows:

$ openssl genrsa -out key.pem
$ openssl req -new -key key.pem -out csr.pem # Enter "localhost" as "Common Name", empty for everything else.
$ openssl x509 -req -days 9999 -in csr.pem -signkey key.pem -out cert.pem
$ rm csr.pem

Sources:
1. https://nodejs.org/en/knowledge/HTTP/servers/how-to-create-a-HTTPS-server/
2. https://flaviocopes.com/express-https-self-signed-certificate/
3. https://stackoverflow.com/questions/10888610/ignore-invalid-self-signed-ssl-certificate-in-node-js-with-https-request
