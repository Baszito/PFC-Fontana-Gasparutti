//levanto un servidor a mano.

const http=require("http"); //imports de nodejs
const fs = require("fs");
const path = require("path");

const PORT = 4000; //seteo el puerto a escuchar
const PUBLIC_DIR = path.join(__dirname); //y la direccion

//Creo un server
//le tengo que pasar la request y el response
//puedo pasar como una funcion aca nomas
//la funcion es lo que ejecuta cada vez que llega un request
//el response es la respuesta
//el request es la pregunta/info entrante

//=> es un alias para function()}{}
http.createServer((req,res) => {
  //creo el path a index.html
  const url = new URL(req.url, `http://${req.headers.host}`);

  let filePath = path.join(
      PUBLIC_DIR,
      url.pathname === "/" ? "index.html" : url.pathname
  );
  //con el filesystem de nodejs, leo el reafFile en filepath
  //readFile me pide la direccion
  //en encoding
  //y un contenido por si obtiene error
  fs.readFile(filePath,(err,content) => {
    if(err){
      res.writeHead(404);
      res.end("filePath equivocado");
      return;
    }

    //saco la extension de name
    const ext = path.extname(filePath);
    //si el tipo de contenido es .js, lo leo con javascript, sino con html
    const contentType = ext ===".js" ? "text/javascript" : "text/html";
    //envio un response header a un requet
    res.writeHead(200,{"Content-Type": contentType});
    //termino el contenido
    res.end(content);
  });
  //escucha a este puerto
}).listen(PORT, () =>{
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});