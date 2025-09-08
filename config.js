Protobject.setProduction(true)
Protobject.initialize(
  [
    { 
      name: "ArUco",
      page: "aruco.html",   // Cámara + detección ArUco
      debug: "local",
    },
    { 
      name: "Lamp",
      page: "index.html",   // Semáforo
      main: true,
      debug: "master",
    }
  ]
);
