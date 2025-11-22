# ---- build stage (igual que antes) ----
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q -DskipTests dependency:go-offline
COPY src ./src
RUN mvn -q -DskipTests package

# ---- runtime stage ----
FROM eclipse-temurin:21-jre AS runner
WORKDIR /app

# Herramientas nativas para leer SVS y escribir PNG
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips libvips-tools \
    libopenslide0 openslide-tools \
 && rm -rf /var/lib/apt/lists/*

# Copiamos el jar
COPY --from=build /app/target/*.jar /app/app.jar

EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]
