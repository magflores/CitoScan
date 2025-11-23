package org.example.citoscan.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.example.citoscan.model.PipelineSession;
import org.example.citoscan.repository.PipelineSessionRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.Reader;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.regex.Pattern;
import java.util.regex.Matcher;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PipelineRunner {

    @Value("${pipeline.root}")
    private String pipelineRoot;

    @Value("${pipeline.url}")
    private String pipelineUrl;

    @Value("${pipeline.exec:local}")
    private String execMode;

    @Value("${pipeline.python:}")
    private String pythonBinLocal;

    @Value("${pipeline.wsl.distro:}")
    private String wslDistro;

    @Value("${pipeline.wsl.python:./venv/bin/python}")
    private String wslPython;

    private final PipelineSessionRepository repo;
    private static final int TILE_SIZE = 1024;


    private static final Pattern TILE_COORD_PATTERN = Pattern.compile(
            ".*_x(\\d+)_y(\\d+)(?:\\.[^.]+)?$",
            Pattern.CASE_INSENSITIVE
    );


    private Path root() {
        return Paths.get(pipelineRoot).toAbsolutePath().normalize();
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

    private static int severityRank(String name) {
        if (name == null) return 0;
        String n = name.toLowerCase(Locale.ROOT).trim();
        switch (n) {
            case "carcinoma" -> {
                return 8;
            }
            case "carcinoma (colgajo)" -> {
                return 7;
            }
            case "alto grado" -> {
                return 6;
            }
            case "alto grado (colgajo)" -> {
                return 5;
            }
            case "bajo grado" -> {
                return 4;
            }
            case "inflamatoria" -> {
                return 3;
            }
            case "endocervicales (grupo)" -> {
                return 2;
            }
            case "sin lesion", "sin lesión" -> {
                return 1;
            }
        }
        if (n.contains("carcinoma") && !n.contains("colgajo")) return 8;
        if (n.contains("carcinoma") && n.contains("colgajo")) return 7;
        if (n.contains("alto") && !n.contains("colgajo")) return 6;
        if (n.contains("alto") && n.contains("colgajo")) return 5;
        if (n.contains("bajo")) return 4;
        if (n.contains("inflam")) return 3;
        if (n.contains("endocerv")) return 2;
        if (n.contains("sin lesion") || n.contains("sin lesión")) return 1;
        return 0;
    }

    @Async
    public void runAsync(Long id, Path svsPath, Path sessionDir, Map<String, String> opts, Path logsDir, Path reportsDir) {
        PipelineSession s = repo.findById(id).orElseThrow();
        s.setStatus("RUNNING");
        s.setStartedAt(Instant.now());
        repo.save(s);

        Long userId = s.getUserId();

        Path pipeRoot = root();
        Path logFile = logsDir.resolve("pipeline.log");
        Path report = reportsDir.resolve("pipeline_report.json");

        try {
            Files.createDirectories(logsDir);
            Files.writeString(
                    logFile,
                    "mode=" + execMode + "\n",
                    StandardOpenOption.CREATE,
                    StandardOpenOption.TRUNCATE_EXISTING
            );
            int exit = 1;

            if ("http".equalsIgnoreCase(execMode)) {
                Files.createDirectories(logsDir);

                var payload = new HashMap<String,Object>();
                payload.put("session_id", String.valueOf(id));
                payload.put("user_id", s.getUserId());
                payload.put("session_dir", sessionDir.toString());
                payload.put("config", "configs/defaults.yaml");
                payload.putAll(opts);

                var url = new java.net.URL(pipelineUrl + "/run");
                var con = (java.net.HttpURLConnection) url.openConnection();
                con.setDoOutput(true);
                con.setRequestMethod("POST");
                con.setConnectTimeout(60_000);
                con.setReadTimeout(0); // espera hasta terminar
                con.setRequestProperty("Content-Type","application/json");
                try (var os = con.getOutputStream()) {
                    os.write(new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsBytes(payload));
                }
                int code = con.getResponseCode();

                String body;
                try (var is = (code >= 200 && code < 300) ? con.getInputStream() : con.getErrorStream()) {
                    body = new String(is.readAllBytes());
                }

                Files.writeString(
                        logFile,
                        "HTTP " + code + "\n" + body + "\n",
                        java.nio.file.StandardOpenOption.CREATE,
                        java.nio.file.StandardOpenOption.APPEND
                );

                int exitCode = 1;
                try {
                    var node = new com.fasterxml.jackson.databind.ObjectMapper().readTree(body);
                    exitCode = node.path("returncode").asInt(0); // 0 = OK por defecto si falta
                    // opcional: también podés volcar stdout/stderr al log
                    var tailOut = node.path("stdout").asText("");
                    var tailErr = node.path("stderr").asText("");
                    if (!tailOut.isEmpty() || !tailErr.isEmpty()) {
                        Files.writeString(logFile, tailOut + "\n" + tailErr + "\n",
                                java.nio.file.StandardOpenOption.APPEND);
                    }
                } catch (Exception ignore) {}

                exit = exitCode;
            }

            else if ("wsl".equalsIgnoreCase(execMode)) {
                String wslCwd = toWslPath(pipeRoot);
                String wslConfig = toWslPath(pipeRoot.resolve("configs").resolve("defaults.yaml"));
                String wslSessDir = toWslPath(sessionDir);

                List<String> inner = new ArrayList<>();
                inner.add("cd " + shQuote(wslCwd));
                inner.add("export PIPELINE_PYTHON=" + shQuote(wslPython));

                StringBuilder pyCmd = new StringBuilder();
                pyCmd.append(shQuote(wslPython)).append(" scripts/run_pipeline.py");
                pyCmd.append(" --session_id ").append(id);
                pyCmd.append(" --user_id ").append(userId);
                pyCmd.append(" --session_dir ").append(shQuote(wslSessDir));
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
                String cfg = pipeRoot.resolve("configs").resolve("defaults.yaml").toString();

                List<String> cmd = new ArrayList<>();
                String bin = (pythonBinLocal != null && !pythonBinLocal.isBlank()) ? pythonBinLocal : null;
                if (bin == null || bin.isBlank()) bin = "python3";
                cmd.add(bin);
                cmd.add(runner.toString());
                cmd.add("--session_id");
                cmd.add(String.valueOf(id));
                cmd.add("--user_id");
                cmd.add(String.valueOf(userId));
                cmd.add("--session_dir");
                cmd.add(sessionDir.toString());
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
                    var node = new ObjectMapper().readTree(Files.readString(report));
                    if (node.has("apt")) {
                        var apt = node.get("apt");
                        if (apt.has("kept_apto")) s.setAptoTotal(apt.get("kept_apto").asInt());
                        if (apt.has("kept_no_apto")) s.setNoAptoTotal(apt.get("kept_no_apto").asInt());
                    }
                    if (node.has("bg")) {
                        var bg = node.get("bg");
                        if (bg.has("discarded")) s.setBackgroundTotal(bg.get("discarded").asInt());
                        if (bg.has("saved")) s.setNotBackgroundTotal(bg.get("saved").asInt());
                    }
                    if (node.has("tiles_total")) {
                        s.setTilesTotal(node.get("tiles_total").asInt());
                    }
                } catch (Exception ignore) {
                }

                Path rawPredsDir = Paths.get(Optional.ofNullable(s.getCellsPredsPath())
                        .orElse(sessionDir.resolve("workspace").resolve("05_cells").resolve("apto").resolve("raw_preds").toString()));

                Path predsCsv = findPredsCsv(rawPredsDir);
                if (predsCsv != null && Files.exists(predsCsv)) {
                    s.setCellsPredsPath(predsCsv.toString());
                    try {
                        DiagnosisAndTopPatches result = computeDiagnosisAndTop(predsCsv, 50);
                        s.setPossibleDiagnosis(result.diagnosis);
                        s.setTopPatchesCount(result.top.size());

                        String json = new ObjectMapper()
                                .writerWithDefaultPrettyPrinter()
                                .writeValueAsString(result.top);

                        Path topPath = reportsDir.resolve("top_patches.json");
                        Files.createDirectories(topPath.getParent());
                        Files.writeString(topPath, json, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
                        s.setTopPatchesJsonPath(topPath.toString());
                    } catch (Exception ex) {
                        Files.writeString(logFile, "\nError al procesar preds.csv: " + ex.getMessage() + "\n",
                                StandardOpenOption.CREATE, StandardOpenOption.APPEND);
                    }
                }

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

    private static Path findPredsCsv(Path rawPredsDir) {
        try {
            if (Files.isRegularFile(rawPredsDir) && rawPredsDir.toString().toLowerCase().endsWith(".csv")) {
                return rawPredsDir;
            }
            if (!Files.exists(rawPredsDir)) return null;
            try (DirectoryStream<Path> ds = Files.newDirectoryStream(rawPredsDir, "*.csv")) {
                List<Path> list = new ArrayList<>();
                for (Path p : ds) list.add(p);
                Map<String, Path> byName = list.stream().collect(Collectors.toMap(
                        x -> x.getFileName().toString().toLowerCase(Locale.ROOT), x -> x, (a, b) -> a));
                if (byName.containsKey("preds.csv")) return byName.get("preds.csv");
                if (byName.containsKey("cells_preds.csv")) return byName.get("cells_preds.csv");
                return list.stream().findFirst().orElse(null);
            }
        } catch (IOException e) {
            return null;
        }
    }

    private static class DiagnosisAndTopPatches {
        String diagnosis;
        List<Map<String, Object>> top;
    }

    private DiagnosisAndTopPatches computeDiagnosisAndTop(Path csvPath, int topN) throws IOException {
        DiagnosisAndTopPatches out = new DiagnosisAndTopPatches();
        out.diagnosis = "Sin lesion";
        out.top = new ArrayList<>();

        Path workspaceDir = csvPath.toAbsolutePath().getParent(); // raw_preds
        while (workspaceDir != null && !workspaceDir.getFileName().toString().equals("workspace")) {
            workspaceDir = workspaceDir.getParent();
        }

        int slideW = 0;
        int slideH = 0;

        if (workspaceDir != null) {
            Path metaPath = workspaceDir.resolve("01_tiles").resolve("tiles_meta.json");

            if (Files.exists(metaPath)) {
                ObjectMapper mapper = new ObjectMapper();
                try (Reader metaReader = Files.newBufferedReader(metaPath)) {
                    JsonNode node = mapper.readTree(metaReader);

                    JsonNode slidesNode = node.path("slides");
                    if (slidesNode.isArray() && !slidesNode.isEmpty()) {
                        JsonNode dimNode = slidesNode.get(0).path("dimensions");
                        slideW = dimNode.path("w").asInt(0);
                        slideH = dimNode.path("h").asInt(0);
                    }

                }
            }else {
                System.err.println("Error tiles_meta.json NO existe en " + metaPath);
            }
        } else {
            System.out.println("Error no se encontró carpeta 'workspace' subiendo desde " + csvPath);
        }

        try (Reader in = Files.newBufferedReader(csvPath);
             CSVParser csv = CSVFormat.DEFAULT.builder().setHeader().setSkipHeaderRecord(true).build().parse(in)) {

            for (CSVRecord r : csv) {
                String rel = getIfPresent(r, "rel_path");
                String cls = getFirstPreferText(r,
                        "top_cls_name", "cls_name", "class", "label_name", "name", "pred_name");

                if (cls == null || cls.isBlank()) {
                    cls = getFirst(r, "top_cls_idx", "label_pred", "class_idx", "label", "pred");
                }

                double conf = parseDoubleFirst(r, 0.0,
                        "top_conf", "confidence", "score", "prob", "conf_used");

                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("rel_path", rel);
                entry.put("cls", cls);
                entry.put("conf", conf);

                if (rel != null && !rel.isBlank()) {
                    try {
                        String filename = Paths.get(rel).getFileName().toString();
                        Matcher m = TILE_COORD_PATTERN.matcher(filename);
                        if (m.matches()) {
                            int x = Integer.parseInt(m.group(1));
                            int y = Integer.parseInt(m.group(2));
                            int w = TILE_SIZE;
                            int h = TILE_SIZE;

                            int cx = x + w / 2;
                            int cy = y + h / 2;

                            entry.put("x", x);
                            entry.put("y", y);
                            entry.put("w", w);
                            entry.put("h", h);
                            entry.put("cx", cx);
                            entry.put("cy", cy);

                            if (slideW > 0 && slideH > 0) {
                                double normX = cx / (double) slideW;
                                double normY = cy / (double) slideH;
                                entry.put("normX", normX);
                                entry.put("normY", normY);
                            }
                        }
                    } catch (Exception ignore) {
                    }
                }

                out.top.add(entry);
            }
        }

        out.top.sort((a, b) -> {
            String clsA = Objects.toString(a.get("cls"), "");
            String clsB = Objects.toString(b.get("cls"), "");
            int sevA = severityRank(clsA);
            int sevB = severityRank(clsB);

            if (sevA != sevB) {
                return Integer.compare(sevB, sevA);
            }

            double confA = (double) a.getOrDefault("conf", 0.0);
            double confB = (double) b.getOrDefault("conf", 0.0);
            return Double.compare(confB, confA);
        });

        if (out.top.size() > topN) {
            out.top = new ArrayList<>(out.top.subList(0, topN));
        }

        int bestRank = 0;
        for (var m : out.top) {
            String cls = Objects.toString(m.get("cls"), null);
            int r = severityRank(cls);
            if (r > bestRank) bestRank = r;
        }

        out.diagnosis = mapSeverityToBucket(bestRank);
        return out;
    }


    private static String mapSeverityToBucket(int rank) {
        if (rank >= 7) return "Carcinoma";
        if (rank >= 5) return "HSIL";
        if (rank == 4) return "LSIL";
        if (rank >= 1) return "NILM";
        return "NILM";
    }

    private static String getFirstPreferText(CSVRecord r, String... cols) {
        String numericFallback = null;
        for (String c : cols) {
            if (r.isMapped(c)) {
                String v = r.get(c);
                if (v != null && !v.isBlank()) {
                    String t = v.trim();
                    if (t.matches("^[+-]?\\d+(?:[.,]\\d+)?$")) {
                        if (numericFallback == null) numericFallback = t;
                        continue;
                    }
                    return t;
                }
            }
        }
        return numericFallback;
    }

    private static String getIfPresent(CSVRecord r, String col) {
        return r.isMapped(col) ? r.get(col) : null;
    }

    private static String getFirst(CSVRecord r, String... cols) {
        for (String c : cols) {
            if (r.isMapped(c)) {
                String v = r.get(c);
                if (v != null && !v.isBlank()) return v;
            }
        }
        return null;
    }

    private static double parseDoubleFirst(CSVRecord r, double def, String... cols) {
        for (String c : cols) {
            if (r.isMapped(c)) {
                try {
                    return Double.parseDouble(r.get(c));
                } catch (Exception ignored) {
                }
            }
        }
        return def;
    }
}
