package detector

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// generateMaskFile creates a PGM P5 mask file for Motion
// ROI is a comma-separated list of indices (0-99) for a 10x10 grid
func generateMaskFile(roi string, path string) error {
	// 1. Initialize 10x10 grid (100 bytes) with 0 (Masked/Black)
	// Motion uses: 0 = ignore motion, 255 = detect motion
	maskData := make([]byte, 100)

	// 2. Parse ROI string
	if roi != "" {
		parts := strings.Split(roi, ",")
		for _, part := range parts {
			idx, err := strconv.Atoi(strings.TrimSpace(part))
			if err == nil && idx >= 0 && idx < 100 {
				maskData[idx] = 255 // Unmask this cell
			}
		}
	} else {
		// If empty ROI, assume full screen detection? 
		// Or no detection? Usually default is full screen.
		// Let's set all to 255 if ROI is empty/null to be safe
		for i := range maskData {
			maskData[i] = 255
		}
	}

	// 3. Create PGM File
	// Header: P5 <width> <height> <maxval>
	header := fmt.Sprintf("P5\n10 10\n255\n")
	
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()

	// Write Header
	if _, err := file.WriteString(header); err != nil {
		return err
	}

	// Write Data
	if _, err := file.Write(maskData); err != nil {
		return err
	}

	return nil
}