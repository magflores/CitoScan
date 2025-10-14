package org.example.citoscan.service.impl;

import lombok.RequiredArgsConstructor;
import org.example.citoscan.model.PipelineSession;
import org.example.citoscan.repository.PipelineSessionRepository;
import org.example.citoscan.security.AppUserDetails;
import org.example.citoscan.service.PipelineService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

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

    @Value("${pipeline.exec:local}")
    private String execMode;

    @Value("${pipeline.python:}")
    private String pythonBinLocal;

    @Value("${pipeline.wsl.distro:}")
    private String wslDistro;

    @Value("${pipeline.wsl.python:./venv/bin/python}")
    private String wslPython;

    private final PipelineSessionRepository repo;

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
        // TODO: ajustá este cast a tu implementación real:
        return ((AppUserDetails) auth.getPrincipal()).getId();
    }

    private String toWslPath(Path p) {
        String abs = p.toAbsolutePath().normalize().toString();
        if (abs.length() >= 2 && abs.charAt(1) == ':') {
            String drive = ("" + Character.toLowerCase(abs.charAt(0)));
            String rest = abs.substring(2).replace("\\", "/");
            return "/mnt/" + drive + "/" + rest;
        }
        return abs;
    }

    private String shQuote(String s) {
        return "'" + s.replace("'", "'\\''") + "'";
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

        Files.createDirectories(inputDir);
        Files.createDirectories(logsDir);
        Files.createDirectories(reportsDir);

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

        s.setSlideName(svsPath.getFileName().toString()); // el nombre final único
        s.setStoragePath(sessionDir.toString());
        s.setLogPath(logsDir.resolve("pipeline.log").toString());
        s.setReportPath(reportsDir.resolve("pipeline_report.json").toString());
        repo.save(s);

        runAsync(s.getId(), svsPath, sessionDir, opts, logsDir, reportsDir);
        return s;
    }

    @Async
    protected void runAsync(Long id, Path svsPath, Path sessionDir, Map<String, String> opts, Path logsDir, Path reportsDir) {
        PipelineSession s = repo.findById(id).orElseThrow();
        s.setStatus("RUNNING");
        s.setStartedAt(Instant.now());
        repo.save(s);

        Path pipeRoot = root();
        Path logFile  = logsDir.resolve("pipeline.log");
        Path report   = reportsDir.resolve("pipeline_report.json");

        try {
            Files.createDirectories(logsDir);
            int exit;

            if ("wsl".equalsIgnoreCase(execMode)) {
                String wslCwd    = toWslPath(pipeRoot);
                String wslConfig = toWslPath(pipeRoot.resolve("configs").resolve("defaults.yaml"));

                List<String> inner = new ArrayList<>();
                inner.add("cd " + shQuote(wslCwd));
                inner.add("export PIPELINE_PYTHON=" + shQuote(wslPython));

                StringBuilder pyCmd = new StringBuilder();
                pyCmd.append(shQuote(wslPython)).append(" scripts/run_pipeline.py");
                pyCmd.append(" --session_id ").append(id);
                pyCmd.append(" --config ").append(shQuote(wslConfig));
                opts.forEach((k, v) -> {
                    if (k != null && v != null) {
                        pyCmd.append(" --").append(k).append(" ").append(shQuote(v));
                    }
                });
                inner.add(pyCmd.toString());
                String bashCmd = String.join(" && ", inner);

                List<String> cmd = (wslDistro == null || wslDistro.isBlank())
                        ? List.of("wsl.exe", "bash", "-lc", bashCmd)
                        : List.of("wsl.exe", "-d", wslDistro, "bash", "-lc", bashCmd);

                Files.writeString(
                        logFile,
                        "mode=WSL\nwsl.cwd=" + wslCwd + "\nwsl.cmd=" + bashCmd + "\n",
                        StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING
                );

                ProcessBuilder pb = new ProcessBuilder(cmd);
                pb.environment().putIfAbsent("TF_FORCE_GPU_ALLOW_GROWTH", "1");
                pb.redirectErrorStream(true);
                pb.redirectOutput(logFile.toFile());
                exit = pb.start().waitFor();

            } else {
                Path runner = pipeRoot.resolve("scripts").resolve("run_pipeline.py");
                String cfg  = pipeRoot.resolve("configs").resolve("defaults.yaml").toString();

                List<String> cmd = new ArrayList<>();
                String bin = (pythonBinLocal != null && !pythonBinLocal.isBlank()) ? pythonBinLocal : null;
                if (bin == null || bin.isBlank()) bin = "python3";
                cmd.add(bin);
                cmd.add(runner.toString());
                cmd.add("--session_id");
                cmd.add(String.valueOf(id));
                cmd.add("--config");
                cmd.add(cfg);
                opts.forEach((k, v) -> {
                    if (k != null && v != null) {
                        cmd.add("--" + k);
                        cmd.add(v);
                    }
                });

                Files.writeString(
                        logFile,
                        "mode=LOCAL\ncwd=" + pipeRoot + "\ncmd=" + String.join(" ", cmd) + "\n",
                        StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING
                );

                ProcessBuilder pb = new ProcessBuilder(cmd);
                pb.environment().putIfAbsent("TF_FORCE_GPU_ALLOW_GROWTH", "1");
                pb.directory(pipeRoot.toFile());
                pb.redirectErrorStream(true);
                pb.redirectOutput(logFile.toFile());
                exit = pb.start().waitFor();
            }

            Files.writeString(logFile, "\n--- EXIT CODE: " + exit + " ---\n",
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);

            if (exit == 0 && Files.exists(report)) {
                try {
                    var node = new com.fasterxml.jackson.databind.ObjectMapper()
                            .readTree(Files.readString(report));
                    if (node.has("apt")) {
                        var apt = node.get("apt");
                        if (apt.has("kept_apto"))    s.setKeptApto(apt.get("kept_apto").asInt());
                        if (apt.has("kept_no_apto")) s.setKeptNoApto(apt.get("kept_no_apto").asInt());
                        if (apt.has("apto_ratio"))   s.setAptoRatio(apt.get("apto_ratio").asDouble());
                        if (apt.has("threshold_used")) s.setThresholdUsed(apt.get("threshold_used").asDouble());
                        if (apt.has("batch_size"))     s.setBatchSize(apt.get("batch_size").asInt());
                        if (apt.has("link_strategy"))  s.setLinkStrategy(apt.get("link_strategy").asText(null));
                    }
                } catch (Exception ignore) { }
                s.setStatus("DONE");
            } else {
                s.setStatus("ERROR");
            }
        } catch (Exception ex) {
            s.setStatus("ERROR");
        } finally {
            s.setFinishedAt(Instant.now());
            repo.save(s);
        }
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