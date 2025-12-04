package org.example.citoscan.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.example.citoscan.model.PipelineSession;
import org.example.citoscan.service.PipelineService;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.multipart.MultipartFile;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@RestController
@RequestMapping("/api/pipeline")
@RequiredArgsConstructor
public class PipelineController {

    private final PipelineService pipelineService;
    private final ObjectMapper om = new ObjectMapper();

    @PostMapping("/sessions")
    public PipelineSession create(@RequestParam("file") MultipartFile file,
                                  @RequestParam Map<String, String> allParams) throws IOException {
        allParams.remove("file");
        return pipelineService.createAndRun(file, allParams);
    }

    @PostMapping("/sessions/preview")
    public PipelineSession createPreview(@RequestParam("file") MultipartFile file,
                                         @RequestParam Map<String, String> allParams) throws IOException {
        allParams.remove("file");
        return pipelineService.createPreviewOnly(file, allParams);
    }

    @PostMapping("/sessions/{id}/run")
    public PipelineSession runExisting(@PathVariable Long id,
                                       @RequestBody(required = false) Map<String, String> body) throws IOException {
        Map<String, String> opts = (body == null) ? Map.of() : body;
        return pipelineService.runExisting(id, opts);
    }

    @GetMapping("/sessions/{id}")
    public ResponseEntity<PipelineSession> get(@PathVariable Long id) {
        return pipelineService.get(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/sessions/{id}/report")
    public ResponseEntity<String> report(@PathVariable Long id) throws IOException {
        String json = pipelineService.readReportJson(id);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .body(json);
    }

    @GetMapping("/sessions/{id}/results")
    public ResponseEntity<Map<String, Object>> results(@PathVariable Long id) throws IOException {
        PipelineSession s = pipelineService.get(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "session not found"));

        List<Map<String, Object>> top = Collections.emptyList();
        if (s.getTopPatchesJsonPath() != null && !s.getTopPatchesJsonPath().isBlank()) {
            Path tp = Paths.get(s.getTopPatchesJsonPath());
            if (Files.exists(tp)) {
                top = om.readValue(Files.readString(tp), List.class);
            }
        }

        String reportJson = pipelineService.readReportJson(id);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("possibleDiagnosis", s.getPossibleDiagnosis());
        out.put("tilesTotal",        s.getTilesTotal());
        out.put("notBackgroundTotal",s.getNotBackgroundTotal());
        out.put("backgroundTotal",   s.getBackgroundTotal());
        out.put("aptoTotal",         s.getAptoTotal());
        out.put("noAptoTotal",       s.getNoAptoTotal());
        out.put("topPatches",        top);
        out.put("pipelineReportJson",reportJson);

        return ResponseEntity.ok(out);
    }

    @GetMapping(value = "/sessions/{id}/preview", produces = MediaType.IMAGE_PNG_VALUE)
    public ResponseEntity<Resource> getPreview(@PathVariable Long id) {
        PipelineSession s = pipelineService.get(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "session not found"));

        Path p = Paths.get(s.getStoragePath(), "artifacts", "preview", "slide.png");
        if (!Files.exists(p)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "preview not found");
        }

        return ResponseEntity.ok()
                .cacheControl(CacheControl.noCache())
                .contentType(MediaType.IMAGE_PNG)
                .body(new FileSystemResource(p));
    }


    @GetMapping("/sessions/{id}/files/**")
    public ResponseEntity<Resource> files(@PathVariable Long id, HttpServletRequest request) throws IOException {
        var s = pipelineService.get(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "session not found"));

        String path = request.getRequestURI().split("/files/")[1];

        Path base = Paths.get(s.getStoragePath());

        Path tilesDir = base.resolve("workspace").resolve("01_tiles");
        Path target = tilesDir.resolve(path).normalize();

        if (!target.startsWith(tilesDir) || !Files.exists(target)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "file not found");
        }

        Resource resource = new FileSystemResource(target.toFile());
        MediaType mt = MediaTypeFactory.getMediaType(target.getFileName().toString())
                .orElse(MediaType.APPLICATION_OCTET_STREAM);
        return ResponseEntity.ok().contentType(mt).body(resource);
    }

    @GetMapping("/sessions/{id}/download-patch")
    public ResponseEntity<Resource> downloadPatchZip(
            @PathVariable Long id,
            @RequestParam("relPath") String relPath
    ) throws IOException {

        PipelineSession s = pipelineService.get(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada"));

        Path sessionDir = Paths.get(s.getStoragePath()).toAbsolutePath().normalize();
        Path tilesRoot = sessionDir.resolve("workspace").resolve("01_tiles");
        Path realPatch = tilesRoot.resolve(relPath).normalize();

        if (!Files.exists(realPatch)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Miniparche no encontrado");
        }

        Path tp = sessionDir.resolve("artifacts").resolve("reports").resolve("top_patches.json");
        List<Map<String, Object>> topPatches = List.of();

        if (Files.exists(tp)) {
            try {
                ObjectMapper mapper = new ObjectMapper();
                topPatches = mapper.readValue(
                        Files.readString(tp),
                        new TypeReference<List<Map<String, Object>>>() {}
                );
            } catch (Exception e) {
                System.err.println("Error leyendo top_patches.json: " + e.getMessage());
            }
        }

        Map<String, Object> patchInfo = topPatches.stream()
                .filter(p -> relPath.equals(p.get("rel_path")))
                .findFirst()
                .orElse(new HashMap<>());

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("Miniparche", realPatch.getFileName().toString());
        meta.put("Prediccion de clase", patchInfo.getOrDefault("cls_raw", "—"));
        meta.put("Clase normalizada", patchInfo.getOrDefault("cls", "—"));
        meta.put("Confianza", patchInfo.getOrDefault("conf", "—"));
        meta.put("Posicion horizontal en muestra original (pixeles)", patchInfo.getOrDefault("x", "—"));
        meta.put("Posicion vertical en muestra original (pixeles)", patchInfo.getOrDefault("y", "—"));

        byte[] metadataJson = new ObjectMapper()
                .writerWithDefaultPrettyPrinter()
                .writeValueAsBytes(meta);

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {

            zos.putNextEntry(new ZipEntry(realPatch.getFileName().toString()));
            Files.copy(realPatch, zos);
            zos.closeEntry();

            zos.putNextEntry(new ZipEntry("metadata.json"));
            zos.write(metadataJson);
            zos.closeEntry();
        }

        ByteArrayResource zipBytes = new ByteArrayResource(baos.toByteArray());

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"patch.zip\"")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .contentLength(zipBytes.contentLength())
                .body(zipBytes);
    }

    @GetMapping("/sessions/{id}/download-cells")
    public void downloadDetectedCells(
            @PathVariable Long id,
            HttpServletResponse response
    ) throws IOException {

        PipelineSession s = pipelineService.get(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada"));

        Path sessionDir = Paths.get(s.getStoragePath()).toAbsolutePath().normalize();
        Path workspace  = sessionDir.resolve("workspace");

        Path byClassRoot = workspace.resolve("05_cells").resolve("apto").resolve("by_class");
        Path tilesRoot   = workspace.resolve("01_tiles");

        Path rawPredsDir = workspace.resolve("05_cells").resolve("apto").resolve("raw_preds");
        Path predsCsv     = rawPredsDir.resolve("preds.csv");
        Path detectionsCsv = rawPredsDir.resolve("detections.csv");

        if (!Files.exists(byClassRoot)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No existe carpeta by_class para esta sesión.");
        }

        response.setHeader("Content-Disposition", "attachment; filename=\"cells_all.zip\"");
        response.setContentType("application/zip");

        try (ZipOutputStream zos = new ZipOutputStream(response.getOutputStream())) {

            if (Files.exists(predsCsv)) {
                zos.putNextEntry(new ZipEntry("raw_preds/preds.csv"));
                Files.copy(predsCsv, zos);
                zos.closeEntry();
            }

            if (Files.exists(detectionsCsv)) {
                zos.putNextEntry(new ZipEntry("raw_preds/detections.csv"));
                Files.copy(detectionsCsv, zos);
                zos.closeEntry();
            }

            Files.walk(byClassRoot)
                    .filter(Files::isRegularFile)
                    .forEach(linkPath -> {
                        try {
                            Path rel = byClassRoot.relativize(linkPath);

                            Path symlinkTarget = Files.readSymbolicLink(linkPath);

                            if (!symlinkTarget.isAbsolute()) {
                                symlinkTarget = linkPath.getParent().resolve(symlinkTarget).normalize();
                            }

                            if (!Files.exists(symlinkTarget)) {
                                System.err.println("Symlink roto: " + linkPath);
                                return;
                            }

                            String entryName = "by_class/" + rel.toString().replace("\\", "/");

                            zos.putNextEntry(new ZipEntry(entryName));
                            Files.copy(symlinkTarget, zos);
                            zos.closeEntry();

                        } catch (Exception e) {
                            System.err.println("Error agregando symlink " + linkPath + ": " + e);
                        }
                    });
        }
    }

}