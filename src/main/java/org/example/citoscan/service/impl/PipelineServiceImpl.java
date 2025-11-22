package org.example.citoscan.service.impl;

import lombok.RequiredArgsConstructor;
import org.example.citoscan.model.PipelineSession;
import org.example.citoscan.repository.PipelineSessionRepository;
import org.example.citoscan.security.AppUserDetails;
import org.example.citoscan.service.PipelineService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.List;


import java.io.IOException;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
public class PipelineServiceImpl implements PipelineService {

    @Value("${pipeline.root}")
    private String pipelineRoot;

    private Path root() {
        return Paths.get(pipelineRoot).toAbsolutePath().normalize();
    }

    private final PipelineSessionRepository repo;
    private final PipelineRunner pipelineRunner; // Bean separado que ejecuta el pipeline

    private static final long MAX_SIZE = 5L * 1024 * 1024 * 1024; // 5 GB
    private static final Set<String> ALLOWED = Set.of(".svs", ".png", ".jpg", ".jpeg");

    private static String sanitizeFilename(String name) {
        if (name == null) return "";
        String base = Paths.get(name).getFileName().toString();
        base = base.replaceAll("[\\r\\n\\t]", "_").trim();
        base = base.replaceAll("[^A-Za-z0-9._ -]", "_");
        return base;
    }
    private static String extOf(String name) {
        if (name == null) return "";
        int i = name.lastIndexOf('.');
        return (i >= 0) ? name.substring(i).toLowerCase() : "";
    }
    private static String baseNameWithoutExt(String filename) {
        int i = filename.lastIndexOf('.');
        return (i >= 0) ? filename.substring(0, i) : filename;
    }
    private static String normalizeExt(String ext) {
        if (".jpeg".equals(ext)) return ".jpg";
        return ext;
    }
    private static boolean isAllowedExt(String ext) {
        return ALLOWED.contains(ext);
    }
    private static String guessExt(MultipartFile f) {
        String ext = normalizeExt(extOf(f.getOriginalFilename()));
        if (isAllowedExt(ext)) return ext;
        String ct = f.getContentType();
        if (ct != null) {
            switch (ct) {
                case "image/jpeg": return ".jpg";
                case "image/png":  return ".png";
                default: break;
            }
        }
        return ".svs";
    }
    private static Path ensureUnique(Path dir, String filename) {
        Path p = dir.resolve(filename);
        if (!Files.exists(p)) return p;
        String base = baseNameWithoutExt(filename);
        String ext  = extOf(filename);
        int n = 1;
        while (true) {
            Path candidate = dir.resolve(base + "-" + n + ext);
            if (!Files.exists(candidate)) return candidate;
            n++;
        }
    }

    private Long currentUserId() {
        var auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        return ((AppUserDetails) auth.getPrincipal()).getId();
    }

    private void generateSvsPreview(Path projectRoot, Path sessionDir, Path svsPath) {
        try {
            Path previewDir = sessionDir.resolve("artifacts").resolve("preview");
            Files.createDirectories(previewDir);
            Path previewPng = previewDir.resolve("slide.png");

            Path script = projectRoot.resolve("pipeline").resolve("scripts").resolve("svs_to_png.py");

            List<String> cmd = Arrays.asList(
                    "python3",
                    script.toString(),
                    "--svs", svsPath.toString(),
                    "--png", previewPng.toString(),
                    "--max-size", "4096"
            );

            ProcessBuilder pb = new ProcessBuilder(cmd)
                    .directory(projectRoot.resolve("pipeline").toFile())
                    .redirectErrorStream(true);

            Process p = pb.start();

            try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = br.readLine()) != null) {
                    System.out.println("[svs_to_png] " + line);
                }
            }

            int code = p.waitFor();
            if (code != 0) {
                System.err.println("svs_to_png terminó con código " + code + " (preview no generado)");
            } else {
                System.out.println("Preview PNG generado en: " + previewPng);
            }
        } catch (IOException | InterruptedException e) {
            System.err.println("Error generando preview PNG: " + e.getMessage());
            Thread.currentThread().interrupt();
        }
    }

    @Override
    @Transactional
    public PipelineSession createAndRun(MultipartFile svsFile, Map<String, String> opts) throws IOException {
        Long userId = currentUserId();

        if (svsFile == null || svsFile.isEmpty()) {
            throw new IllegalArgumentException("Archivo vacío");
        }
        if (svsFile.getSize() > MAX_SIZE) {
            throw new IllegalArgumentException("El archivo supera el tamaño máximo permitido (5 GB).");
        }

        PipelineSession s = new PipelineSession();
        s.setUserId(userId);
        s.setStatus("QUEUED");
        s.setCreatedAt(Instant.now());
        s = repo.save(s);

        Path pipeRoot     = root();
        Path sessionsRoot = pipeRoot.resolve("resources").resolve("sessions");
        Path sessionDir   = sessionsRoot.resolve(String.valueOf(userId)).resolve(String.valueOf(s.getId()));
        Path inputDir     = sessionDir.resolve("input");
        Path logsDir      = sessionDir.resolve("artifacts").resolve("logs");
        Path reportsDir   = sessionDir.resolve("artifacts").resolve("reports");
        Path workspaceDir = sessionDir.resolve("workspace");

        Files.createDirectories(inputDir);
        Files.createDirectories(logsDir);
        Files.createDirectories(reportsDir);
        Files.createDirectories(workspaceDir);

        String originalSan = sanitizeFilename(svsFile.getOriginalFilename());
        String base        = baseNameWithoutExt(originalSan);
        if (base.isBlank()) base = "slide_" + s.getId();

        String ext = normalizeExt(extOf(originalSan));
        if (!isAllowedExt(ext)) {
            ext = guessExt(svsFile);
        }
        if (!isAllowedExt(ext)) {
            throw new IllegalArgumentException("Extensión no permitida");
        }

        String cleanName = base + ext;
        Path svsPath     = ensureUnique(inputDir, cleanName);
        svsFile.transferTo(svsPath.toFile());

        generateSvsPreview(root(), sessionDir, svsPath);

        Path tilesPath = workspaceDir.resolve("01_tiles");
        Path cellsRawPredsDir = workspaceDir.resolve("05_cells").resolve("apto").resolve("raw_preds");
        Files.createDirectories(tilesPath);
        Files.createDirectories(cellsRawPredsDir);

        s.setSlideName(svsPath.getFileName().toString());
        s.setStoragePath(sessionDir.toString());
        s.setTilesPath(tilesPath.toString());
        s.setCellsPredsPath(cellsRawPredsDir.toString());
        s.setLogPath(logsDir.resolve("pipeline.log").toString());
        s.setReportPath(reportsDir.resolve("pipeline_report.json").toString());
        repo.save(s);

        final Long sessionId = s.getId();
        final Map<String, String> optsCopy = (opts == null) ? Map.of() : new LinkedHashMap<>(opts);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() {
                pipelineRunner.runAsync(
                        sessionId, svsPath, sessionDir, optsCopy, logsDir, reportsDir
                );
            }
        });

        return s;
    }

    @Override
    public Optional<PipelineSession> get(Long id) {
        Long userId = currentUserId();
        return repo.findByIdAndUserId(id, userId);
    }

    @Override
    public String readReportJson(Long id) throws IOException {
        Long userId = currentUserId();
        PipelineSession s = repo.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new NoSuchElementException("session not found"));
        if (s.getReportPath() == null) return "{}";
        Path p = Paths.get(s.getReportPath());
        return Files.exists(p) ? Files.readString(p) : "{}";
    }
}