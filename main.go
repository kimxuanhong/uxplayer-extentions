package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"github.com/godbus/dbus/v5"
)

var (
	uxplayCmd *exec.Cmd
	mu        sync.Mutex
	exitChan  = make(chan struct{})
	isSharing bool
	dbusConn  *dbus.Conn
	uxConfig  = defaultConfig()
)

type UxPlayConfig struct {
	ServerName string `json:"serverName"`
	Resolution string `json:"resolution"`
	FPS        string `json:"fps"`
	AudioSink  string `json:"audioSink"`
	VideoSink  string `json:"videoSink"`
	Flip       string `json:"flip"`
	Rotation   string `json:"rotation"`
}

func defaultConfig() UxPlayConfig {
	return UxPlayConfig{
		ServerName: "Ubuntu AirPlay",
		Resolution: "",
		FPS:        "",
		AudioSink:  "autoaudiosink",
		VideoSink:  "autovideosink",
		Flip:       "",
		Rotation:   "",
	}
}

func configFilePath() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(configDir, "uxplay-tray", "config.json"), nil
}

func loadConfig() UxPlayConfig {
	path, err := configFilePath()
	if err != nil {
		log.Printf("Cannot resolve config path, using defaults: %v", err)
		return defaultConfig()
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("Cannot read config, using defaults: %v", err)
		}
		return defaultConfig()
	}

	cfg := defaultConfig()
	if err := json.Unmarshal(data, &cfg); err != nil {
		log.Printf("Invalid config format, using defaults: %v", err)
		return defaultConfig()
	}

	normalizeConfig(&cfg)
	return cfg
}

func saveConfig(cfg UxPlayConfig) error {
	path, err := configFilePath()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0o644)
}

func normalizeConfig(cfg *UxPlayConfig) {
	cfg.ServerName = strings.TrimSpace(cfg.ServerName)
	cfg.Resolution = strings.TrimSpace(cfg.Resolution)
	cfg.FPS = strings.TrimSpace(cfg.FPS)
	cfg.AudioSink = strings.TrimSpace(cfg.AudioSink)
	cfg.VideoSink = strings.TrimSpace(cfg.VideoSink)
	cfg.Flip = strings.TrimSpace(cfg.Flip)
	cfg.Rotation = strings.TrimSpace(cfg.Rotation)

	if cfg.ServerName == "" {
		cfg.ServerName = "Ubuntu AirPlay"
	}
	if cfg.AudioSink == "" {
		cfg.AudioSink = "autoaudiosink"
	}
	if cfg.VideoSink == "" {
		cfg.VideoSink = "autovideosink"
	}
}

func uxplayArgsFromConfig(cfg UxPlayConfig) []string {
	args := []string{"-n", cfg.ServerName}

	if cfg.Resolution != "" {
		args = append(args, "-s", cfg.Resolution)
	}

	if cfg.FPS != "" {
		args = append(args, "-fps", cfg.FPS)
	}

	if cfg.AudioSink == "0" {
		args = append(args, "-as", "0")
	} else if cfg.AudioSink != "" && cfg.AudioSink != "autoaudiosink" {
		args = append(args, "-as", cfg.AudioSink)
	}

	if cfg.VideoSink == "0" {
		args = append(args, "-vs", "0")
	} else if cfg.VideoSink != "" && cfg.VideoSink != "autovideosink" {
		args = append(args, "-vs", cfg.VideoSink)
	}

	if cfg.Flip != "" {
		args = append(args, "-f", cfg.Flip)
	}

	if cfg.Rotation != "" {
		args = append(args, "-r", cfg.Rotation)
	}

	return args
}

// Gọi trong lock
func isRunning() bool {
	return uxplayCmd != nil
}

// DBus Object
type UxPlay struct{}

func (u UxPlay) Toggle() (bool, *dbus.Error) {
	mu.Lock()
	running := isRunning()
	mu.Unlock()

	if running {
		stopUxPlay()
		return false, nil
	} else {
		startUxPlay()
		return true, nil
	}
}

func (u UxPlay) Status() (bool, *dbus.Error) {
	mu.Lock()
	defer mu.Unlock()
	return isRunning(), nil
}

func (u UxPlay) IsSharing() (bool, *dbus.Error) {
	mu.Lock()
	defer mu.Unlock()
	return isSharing, nil
}

func (u UxPlay) GetConfig() (string, *dbus.Error) {
	mu.Lock()
	defer mu.Unlock()

	data, err := json.Marshal(uxConfig)
	if err != nil {
		return "", dbus.MakeFailedError(err)
	}

	return string(data), nil
}

func (u UxPlay) SetConfig(config string) (bool, *dbus.Error) {
	var incoming UxPlayConfig
	if err := json.Unmarshal([]byte(config), &incoming); err != nil {
		return false, dbus.MakeFailedError(fmt.Errorf("invalid config json: %w", err))
	}

	normalizeConfig(&incoming)

	mu.Lock()
	uxConfig = incoming
	running := isRunning()
	mu.Unlock()

	if err := saveConfig(incoming); err != nil {
		return false, dbus.MakeFailedError(fmt.Errorf("failed to save config: %w", err))
	}

	if running {
		stopUxPlay()
		startUxPlay()
	}

	return true, nil
}

func (u UxPlay) Quit() (bool, *dbus.Error) {
	stopUxPlay()
	close(exitChan)
	return true, nil
}

func initDBus() {
	conn, err := dbus.ConnectSessionBus()
	if err != nil {
		log.Fatalf("Failed to connect to session bus: %v", err)
	}
	dbusConn = conn

	u := UxPlay{}
	conn.Export(u, "/org/uxplay/Tray", "org.uxplay.Tray")
	reply, err := conn.RequestName("org.uxplay.Tray", dbus.NameFlagDoNotQueue)
	if err != nil {
		log.Printf("Failed to request DBus name: %v", err)
		return
	}
	if reply != dbus.RequestNameReplyPrimaryOwner {
		log.Println("DBus name already taken")
	}
}

func updateSharingStatus(state bool, source string) {
	mu.Lock()
	defer mu.Unlock()

	if isSharing != state {
		isSharing = state
		log.Printf("--> [%s] Sharing status updating to: %v\n", source, isSharing)
		if dbusConn != nil {
			err := dbusConn.Emit("/org/uxplay/Tray", "org.uxplay.Tray.SharingChanged", isSharing)
			if err != nil {
				log.Printf("Failed to emit SharingChanged signal: %v", err)
			}
		}
	}
}

func startUxPlay() {
	mu.Lock()
	defer mu.Unlock()

	if isRunning() {
		return
	}

	// Try starting uxplay with unbuffered output using stdbuf
	args := append([]string{"-i0", "-o0", "-e0", "uxplay"}, uxplayArgsFromConfig(uxConfig)...)
	cmd := exec.Command("stdbuf", args...)
	log.Printf("Starting UxPlay with args: %v", uxplayArgsFromConfig(uxConfig))

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		log.Printf("Failed to create stdout pipe: %v", err)
		return
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		log.Printf("Failed to create stderr pipe: %v", err)
		return
	}

	if err := cmd.Start(); err != nil {
		log.Printf("Failed to start uxplay: %v", err)
		return
	}

	uxplayCmd = cmd
	log.Printf("UxPlay started (PID: %d)", cmd.Process.Pid)

	// Goroutine to read stdout
	go func() {
		scanner := bufio.NewScanner(stdout)
		re := regexp.MustCompile(`Open connections: (\d+)`)
		for scanner.Scan() {
			line := scanner.Text()
			//log.Println("STDOUT:", line)
			if matches := re.FindStringSubmatch(line); len(matches) > 1 {
				count, err := strconv.Atoi(matches[1])
				if err == nil {
					updateSharingStatus(count > 0, "STDOUT")
				}
			}
		}
	}()

	// Goroutine to read stderr
	go func() {
		scanner := bufio.NewScanner(stderr)
		re := regexp.MustCompile(`Open connections: (\d+)`)
		for scanner.Scan() {
			line := scanner.Text()
			//log.Println("STDERR:", line)
			if matches := re.FindStringSubmatch(line); len(matches) > 1 {
				count, err := strconv.Atoi(matches[1])
				if err == nil {
					updateSharingStatus(count > 0, "STDERR")
				}
			}
		}
	}()

	go func() {
		cmd.Wait()
		mu.Lock()
		uxplayCmd = nil
		mu.Unlock()
		updateSharingStatus(false, "EXIT")
		log.Println("UxPlay exited")
	}()
}

func stopUxPlay() {
	mu.Lock()
	defer mu.Unlock()

	if !isRunning() {
		return
	}

	if err := uxplayCmd.Process.Kill(); err != nil {
		log.Printf("Failed to kill uxplay: %v", err)
		return
	}

	log.Printf("UxPlay stopped (PID: %d)", uxplayCmd.Process.Pid)
	uxplayCmd = nil
}

func main() {
	uxConfig = loadConfig()
	initDBus()
	<-exitChan
}
