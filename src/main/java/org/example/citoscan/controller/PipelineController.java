package org.example.citoscan.controller;

import org.springframework.core.io.Resource;
import org.springframework.core.io.FileSystemResource;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.example.citoscan.model.PipelineSession;
import org.example.citoscan.service.PipelineService;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;

@RestController
@RequestMapping("/api/pipeline")
@RequiredArgsConstructor
public class PipelineController {

    private final PipelineService pipelineService;

    @PostMapping(value="/sessions", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String,Object>> create(
            @RequestPart("file") MultipartFile svs,
            @RequestParam Map<String,String> opts
    ) throws IOException {
        var s = pipelineService.createAndRun(svs, opts);
        return ResponseEntity.ok(Map.of(
                "id", s.getId(),
                "status", s.getStatus(),
                "slideName", s.getSlideName()
        ));
    }

    @GetMapping("/sessions/{id}")
    public ResponseEntity<PipelineSession> get(@PathVariable Long id) {
        return pipelineService.get(id).map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping(value="/sessions/{id}/report", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> report(@PathVariable Long id) throws IOException {
        return ResponseEntity.ok(pipelineService.readReportJson(id));
    }

    @GetMapping("/sessions/{id}/files/**")
    public ResponseEntity<Resource> files(@PathVariable Long id, HttpServletRequest request) throws IOException {
        var s = pipelineService.get(id).orElseThrow();
        String path = request.getRequestURI().split("/files/")[1];
        Path base = Paths.get(s.getStoragePath());
        Path target = base.resolve(path).normalize();

        if (!target.startsWith(base) || !Files.exists(target)) {
            return ResponseEntity.notFound().build();
        }

        Resource resource = new FileSystemResource(target.toFile());
        return ResponseEntity.ok()
                .contentType(MediaTypeFactory.getMediaType(target.getFileName().toString())
                        .orElse(MediaType.APPLICATION_OCTET_STREAM))
                .body(resource);
    }
}
