import os
import shutil
import subprocess
import tempfile
from threading import BoundedSemaphore
import time
from typing import Tuple

TIMEOUT_SECONDS = 10
MAX_CONCURRENT_EXECUTIONS = int(os.getenv("MAX_CONCURRENT_EXECUTIONS", str(max(2, (os.cpu_count() or 2)))))
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
LOCAL_NODE = os.path.join(PROJECT_ROOT, ".local-tools", "node-v22.22.0-linux-x64", "bin", "node")
LOCAL_JAVA_HOME = os.path.join(PROJECT_ROOT, ".local-tools", "java", "usr", "lib", "jvm", "java-11-openjdk-amd64")
LOCAL_CPP_ROOT = os.path.join(PROJECT_ROOT, ".local-tools", "cpp")
LOCAL_CPP_BIN = os.path.join(PROJECT_ROOT, ".local-tools", "cpp", "usr", "bin", "g++-10")
execution_slots = BoundedSemaphore(MAX_CONCURRENT_EXECUTIONS)


def resolve_binary(*candidates: str) -> str:
    for candidate in candidates:
        if os.path.isabs(candidate) and os.path.exists(candidate):
            return candidate
        found = shutil.which(candidate)
        if found:
            return found
    return ""


def run_process(command: list, input_data: str, cwd: str = None, env: dict = None) -> Tuple[str, float, str]:
    start = time.time()
    try:
        result = subprocess.run(
            command,
            input=input_data,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
            cwd=cwd,
            env=env,
        )
        elapsed = round(time.time() - start, 3)
        if result.returncode != 0:
            return "", elapsed, (result.stderr or result.stdout).strip()
        return result.stdout.strip(), elapsed, ""
    except subprocess.TimeoutExpired:
        return "", TIMEOUT_SECONDS, "Time Limit Exceeded"
    except Exception as e:
        return "", 0.0, str(e)

def run_python(code: str, input_data: str) -> Tuple[str, float, str]:
    """Execute Python code with input. Returns (output, exec_time, error)."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
        f.write(code)
        tmp_path = f.name

    try:
        return run_process(["python3", tmp_path], input_data)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def run_javascript(code: str, input_data: str) -> Tuple[str, float, str]:
    node = resolve_binary(LOCAL_NODE, "node")
    if not node:
        return "", 0.0, "JavaScript execution requires Node.js"

    with tempfile.NamedTemporaryFile(mode="w", suffix=".js", delete=False) as f:
        f.write(code)
        tmp_path = f.name

    try:
        return run_process([node, tmp_path], input_data)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def run_cpp(code: str, input_data: str) -> Tuple[str, float, str]:
    compiler = resolve_binary(LOCAL_CPP_BIN, "g++", "g++-10")
    if not compiler:
        return "", 0.0, "C++ execution requires g++"

    env = os.environ.copy()
    if compiler == LOCAL_CPP_BIN:
        env["PATH"] = f"{os.path.join(LOCAL_CPP_ROOT, 'usr', 'bin')}:{env.get('PATH', '')}"
        env["LD_LIBRARY_PATH"] = (
            f"{os.path.join(LOCAL_CPP_ROOT, 'usr', 'lib', 'x86_64-linux-gnu')}:"
            f"{env.get('LD_LIBRARY_PATH', '')}"
        )

    with tempfile.TemporaryDirectory() as tmpdir:
        source_path = os.path.join(tmpdir, "main.cpp")
        binary_path = os.path.join(tmpdir, "main")
        with open(source_path, "w") as f:
            f.write(code)

        command = [compiler, source_path, "-std=c++17", "-O2", "-pipe", "-o", binary_path]
        if compiler == LOCAL_CPP_BIN:
            command.insert(1, f"--sysroot={LOCAL_CPP_ROOT}")

        compile_output, compile_time, compile_error = run_process(command, "", env=env)
        if compile_error:
            return compile_output, compile_time, compile_error

        return run_process([binary_path], input_data)


def extract_java_class_name(code: str) -> str:
    import re

    public_match = re.search(r"\bpublic\s+class\s+([A-Za-z_][A-Za-z0-9_]*)", code)
    if public_match:
        return public_match.group(1)

    class_match = re.search(r"\bclass\s+([A-Za-z_][A-Za-z0-9_]*)", code)
    if class_match:
        return class_match.group(1)

    return "Main"


def run_java(code: str, input_data: str) -> Tuple[str, float, str]:
    javac = resolve_binary(os.path.join(LOCAL_JAVA_HOME, "bin", "javac"), "javac")
    java = resolve_binary(os.path.join(LOCAL_JAVA_HOME, "bin", "java"), "java")
    if not javac or not java:
        return "", 0.0, "Java execution requires a JDK"

    class_name = extract_java_class_name(code)
    with tempfile.TemporaryDirectory() as tmpdir:
        source_path = os.path.join(tmpdir, f"{class_name}.java")
        with open(source_path, "w") as f:
            f.write(code)

        compile_output, compile_time, compile_error = run_process([javac, source_path], "")
        if compile_error:
            return compile_output, compile_time, compile_error

        return run_process([java, "-cp", tmpdir, class_name], input_data)

def execute_code(language: str, code: str, input_data: str) -> Tuple[str, float, str]:
    if not execution_slots.acquire(blocking=False):
        return "", 0.0, "Server is busy running code. Please try again in a moment."

    try:
        language_key = language.lower()
        if language_key == "python":
            return run_python(code, input_data)
        if language_key in {"javascript", "js", "node"}:
            return run_javascript(code, input_data)
        if language_key in {"cpp", "c++"}:
            return run_cpp(code, input_data)
        if language_key == "java":
            return run_java(code, input_data)
        return "", 0.0, f"Unsupported language: {language}"
    finally:
        execution_slots.release()
