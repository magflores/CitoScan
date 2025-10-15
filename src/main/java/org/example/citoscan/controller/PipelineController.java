package org.example.citoscan.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.citoscan.model.PipelineSession;
import org.example.citoscan.service.PipelineService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import org.springframework.web.multipart.MultipartFile;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;

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

    @GetMapping("/sessions/{id}/files/**")
    public ResponseEntity<Resource> files(@PathVariable Long id, HttpServletRequest request) throws IOException {
        var s = pipelineService.get(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "session not found"));

        String path = request.getRequestURI().split("/files/")[1];
        Path base = Paths.get(s.getStoragePath());
        Path target = base.resolve(path).normalize();

        if (!target.startsWith(base) || !Files.exists(target)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "file not found");
        }

        Resource resource = new FileSystemResource(target.toFile());
        MediaType mt = MediaTypeFactory.getMediaType(target.getFileName().toString())
                .orElse(MediaType.APPLICATION_OCTET_STREAM);
        return ResponseEntity.ok().contentType(mt).body(resource);
    }
}